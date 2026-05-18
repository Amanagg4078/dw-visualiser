import { useEffect, useMemo, useRef, useState } from "react";
import { tokenize, parse, evaluate, formatValue, buildLineSteps, lineIndexForStep } from "./engine";
import { dwEntries } from "./engine/semantics.js";
import { SAMPLES, SAMPLES_BY_ID } from "./samples";

const isPrimitive = (v) => v === null || typeof v !== "object";

// JSON serializer that preserves DW's duplicate-key Object semantics —
// real DW Objects are ordered pair lists, not Maps, so `{a: 1} ++ {a: 2}`
// renders as `{"a": 1, "a": 2}`. JSON.stringify can't emit duplicate keys
// (JS objects dedupe), so we render the text by hand using dwEntries,
// which returns the original ordered pair list when one is attached.
function dwStringify(value, indent = 2, level = 0) {
  const pad = (n) => " ".repeat(n * indent);
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const inner = value.map((v) => pad(level + 1) + dwStringify(v, indent, level + 1));
    return `[\n${inner.join(",\n")}\n${pad(level)}]`;
  }
  if (typeof value === "object") {
    if (value.__closure === true) return `"<fn (${(value.params || []).join(", ")})>"`;
    const entries = dwEntries(value);
    if (entries.length === 0) return "{}";
    const inner = entries.map(([k, v]) => `${pad(level + 1)}${JSON.stringify(String(k))}: ${dwStringify(v, indent, level + 1)}`);
    return `{\n${inner.join(",\n")}\n${pad(level)}}`;
  }
  return JSON.stringify(value);
}

// Categorical badge colours per trace phase. These are intentionally static
// (not themed) — the phase pill is always white-on-coloured-bg, which reads
// fine in either theme. Picked away from theme vars so replace-all stays safe.
const PHASE_COLORS = {
  literal: "#6b7280", lookup: "#2563eb", selector: "#0891b2", "index-selector": "#0e7490",
  "range-selector": "#155e75", "range-lit": "#155e75", "multi-value-selector": "#0e7490", "descendants-selector": "#1e40af",
  binop: "#8b5cf6", unary: "#8b5cf6", logical: "#d946ef",
  "if-else": "#db2777", lambda: "#0d9488", call: "#16a34a", match: "#be185d", update: "#7c2d12", default: "#a16207",
  "object-start": "#059669", "object-field": "#10b981", "object-done": "#15803d",
  "array-start": "#059669", "array-item": "#10b981", "array-done": "#15803d",
  "var-start": "#a16207", "var-done": "#ca8a04",
  "body-start": "#be185d", "body-done": "#15803d",
};

// Default state for first paint comes from the first sample in the manifest.
const DEFAULT_SAMPLE = SAMPLES[0];
const SAMPLE = DEFAULT_SAMPLE.script;
const SAMPLE_INPUT = JSON.stringify(DEFAULT_SAMPLE.payload, null, 2);

// Editor + gutter share these so rows stay aligned.
const FONT_SIZE = 13;
const LINE_HEIGHT = 1.6;
const PADDING = 12;
const LINE_PX = FONT_SIZE * LINE_HEIGHT;

const ARROW_GREEN = "var(--arrow-green)"; // just executed
const ARROW_RED   = "var(--arrow-red)"; // next to execute

// Auto-pairs the editors do when the user types an opener:
//   "(" → "()"  with the caret between them
//   "[" → "[]"
//   "{" → "{}"
//   '"' → '""'
// Plus two ergonomics:
//   - Skip-over: typing a closer when the same char is already to the right
//     of the cursor just moves the caret instead of inserting a duplicate.
//   - Smart backspace: when the caret sits between an empty matched pair,
//     backspace deletes both halves.
// Called from the script + input textareas' onKeyDown. No-op on read-only.
const AUTO_PAIRS = { "(": ")", "[": "]", "{": "}", '"': '"' };
const AUTO_CLOSERS = new Set(Object.values(AUTO_PAIRS));
function handleAutoClose(e, setValue, setStep) {
  const ta = e.target;
  if (ta.readOnly) return;
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  const value = ta.value;
  const setCaret = (pos) => {
    requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = pos; });
  };

  // Skip-over: closer typed when same char is already next (handles `"` first
  // since it's both an opener and a closer).
  if (start === end && AUTO_CLOSERS.has(e.key) && value[start] === e.key) {
    e.preventDefault();
    setCaret(start + 1);
    return;
  }

  // Auto-pair the opener (only when no text is selected — otherwise let the
  // browser handle it as a replace).
  if (start === end && e.key in AUTO_PAIRS) {
    e.preventDefault();
    const opener = e.key;
    const closer = AUTO_PAIRS[opener];
    setValue(value.slice(0, start) + opener + closer + value.slice(end));
    if (setStep) setStep(0);
    setCaret(start + 1);
    return;
  }

  // Smart backspace inside an empty matched pair.
  if (e.key === "Backspace" && start === end && start > 0) {
    const before = value[start - 1];
    const after = value[start];
    if (AUTO_PAIRS[before] && AUTO_PAIRS[before] === after) {
      e.preventDefault();
      setValue(value.slice(0, start - 1) + value.slice(start + 1));
      if (setStep) setStep(0);
      setCaret(start - 1);
    }
  }
}

// Measure how wide one monospace character renders at FONT_SIZE. Used to
// estimate how many visual rows each logical line wraps into so the gutter
// can give each logical line a single line number that spans the height of
// all its wrap rows (matches what an IDE like VSCode shows).
const measureMonospaceCharWidth = () => {
  if (typeof document === "undefined") return FONT_SIZE * 0.6; // SSR fallback
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  ctx.font = `${FONT_SIZE}px ui-monospace, Consolas, monospace`;
  return ctx.measureText("M").width;
};
const CHAR_WIDTH = measureMonospaceCharWidth();

// For a given logical line and the editor's content width, how many visual
// rows does the line occupy?
function visualRowsForLine(line, contentWidth) {
  if (contentWidth <= 0) return 1;
  const charsPerRow = Math.max(1, Math.floor(contentWidth / CHAR_WIDTH));
  return Math.max(1, Math.ceil((line.length || 1) / charsPerRow));
}

function ScriptGutter({ lineHeights, prevLine, nextLine, scrollTop }) {
  // Cumulative top offsets per logical line — `linePos(n)` is the Y position
  // (within the scrolling layer) at which line n's gutter entry / arrow sits.
  const lineTops = [];
  let acc = PADDING;
  for (const h of lineHeights) { lineTops.push(acc); acc += h; }
  const linePos = (n) => lineTops[n - 1] ?? PADDING;

  return (
    <div style={{
      width: 52,
      background: "var(--bg-elev)",
      borderRight: "1px solid var(--bg-panel)",
      overflow: "hidden",
      flexShrink: 0,
      position: "relative",
    }}>
      {/* Line numbers + arrows share this scrolling layer. translateY tracks the */}
      {/* textarea's scrollTop (no transition — must follow scroll instantly). */}
      {/* The arrows transition only on `top`, so a line change animates while a */}
      {/* scroll doesn't. */}
      <div style={{
        transform: `translateY(${-scrollTop}px)`,
        paddingTop: PADDING,
        paddingBottom: PADDING,
        fontFamily: "ui-monospace, monospace",
        fontSize: FONT_SIZE,
        lineHeight: LINE_HEIGHT,
        color: "var(--text-fainter)",
        position: "relative",
      }}>
        {/* One entry per logical line, height proportional to how many visual */}
        {/* rows it wraps into. Number is top-aligned so it sits on the first row. */}
        {lineHeights.map((h, i) => (
          <div key={i} style={{
            height: h,
            paddingRight: 8,
            paddingTop: 0,
            textAlign: "right",
            lineHeight: `${LINE_HEIGHT}em`,
          }}>{i + 1}</div>
        ))}

        {prevLine != null && (
          <div style={{
            position: "absolute",
            left: 4,
            top: linePos(prevLine),
            color: ARROW_GREEN,
            fontSize: FONT_SIZE,
            lineHeight: `${LINE_HEIGHT}em`,
            height: `${LINE_HEIGHT}em`,
            transition: "top 200ms ease-out, color 150ms",
            pointerEvents: "none",
            fontWeight: 700,
          }}>▶</div>
        )}
        {nextLine != null && nextLine !== prevLine && (
          <div style={{
            position: "absolute",
            left: 4,
            top: linePos(nextLine),
            color: ARROW_RED,
            fontSize: FONT_SIZE,
            lineHeight: `${LINE_HEIGHT}em`,
            height: `${LINE_HEIGHT}em`,
            transition: "top 200ms ease-out, color 150ms",
            pointerEvents: "none",
            fontWeight: 700,
            opacity: 0.85,
          }}>▶</div>
        )}
      </div>
    </div>
  );
}

function SectionLabel({ children, right }) {
  return (
    <div style={{
      background: "var(--bg-panel)",
      padding: "5px 10px",
      fontSize: 10,
      fontWeight: 700,
      textTransform: "uppercase",
      letterSpacing: 1,
      color: "var(--accent-soft)",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
      flexShrink: 0,
      borderBottom: "1px solid var(--bg-surface)",
    }}>
      <span>{children}</span>
      {right && <span style={{ fontWeight: 500, textTransform: "none", letterSpacing: 0, color: "var(--text-faint)" }}>{right}</span>}
    </div>
  );
}

// Syntax-coloured JSON renderer for the final output. Keeps types visually
// distinct: keys purple, strings green, numbers amber, bool/null cyan/grey,
// punctuation muted. Recurses through arrays and objects with 2-space indent.
function JsonView({ value, indent = 0 }) {
  const pad = (n) => " ".repeat(n * 2);

  if (value === null || value === undefined) return <span style={{ color: "var(--text-muted)" }}>null</span>;
  if (typeof value === "object" && value.__closure === true) {
    return <span style={{ color: "var(--accent-soft)" }}>{`<fn (${(value.params || []).join(", ")})>`}</span>;
  }
  if (typeof value === "boolean") return <span style={{ color: "var(--json-bool)" }}>{String(value)}</span>;
  if (typeof value === "number")  return <span style={{ color: "var(--frame-value)" }}>{String(value)}</span>;
  if (typeof value === "string")  return <span style={{ color: "var(--text-output)" }}>{JSON.stringify(value)}</span>;

  if (Array.isArray(value)) {
    if (value.length === 0) return <span style={{ color: "var(--text-code)" }}>[]</span>;
    return (
      <>
        <span style={{ color: "var(--text-code)" }}>[</span>
        {value.map((v, i) => (
          <div key={i}>
            {pad(indent + 1)}
            <JsonView value={v} indent={indent + 1} />
            {i < value.length - 1 && <span style={{ color: "var(--text-faint)" }}>,</span>}
          </div>
        ))}
        {pad(indent)}<span style={{ color: "var(--text-code)" }}>]</span>
      </>
    );
  }

  if (typeof value === "object") {
    // Use dwEntries — when the object came from `++` merge / object literal
    // with duplicate keys, this returns the original ordered pair list
    // (with dupes); otherwise Object.entries. Keys can repeat, so the React
    // child key uses (k + index) to stay unique.
    const entries = dwEntries(value);
    if (entries.length === 0) return <span style={{ color: "var(--text-code)" }}>{"{}"}</span>;
    return (
      <>
        <span style={{ color: "var(--text-code)" }}>{"{"}</span>
        {entries.map(([k, v], i) => (
          <div key={`${k}-${i}`}>
            {pad(indent + 1)}
            <span style={{ color: "var(--json-key)" }}>{JSON.stringify(k)}</span>
            <span style={{ color: "var(--text-faint)" }}>: </span>
            <JsonView value={v} indent={indent + 1} />
            {i < entries.length - 1 && <span style={{ color: "var(--text-faint)" }}>,</span>}
          </div>
        ))}
        {pad(indent)}<span style={{ color: "var(--text-code)" }}>{"}"}</span>
      </>
    );
  }

  return <span style={{ color: "var(--text-muted)" }}>{String(value)}</span>;
}

// Python-Tutor-style scope split: primitives go in the Frame column as
// `name = value` chips; arrays/objects go in the Objects column as small
// JSON cards. The Frame still lists the heap-object names so you can see all
// declared bindings together.
function ScopePanel({ scope }) {
  // The root frame seeds every script with built-in HOFs (filter, map, …) and
  // helpers (upper, lower, sizeOf). Those are always in scope but are
  // implementation noise from a learner's perspective — hide them so the
  // panel shows only what the user actually wrote (payload, vars, lambda
  // params, user-defined functions).
  const entries = Object.entries(scope || {}).filter(
    ([, v]) => !(v && typeof v === "object" && v.__native === true)
  );
  if (entries.length === 0) return null;
  const frame = entries.filter(([, v]) => isPrimitive(v));
  const heap  = entries.filter(([, v]) => !isPrimitive(v));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div>
        <div style={{ color: "var(--text-muted)", fontSize: 10, marginBottom: 5, textTransform: "uppercase", letterSpacing: 1 }}>Frame</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {frame.map(([k, v]) => {
            const s = formatValue(v);
            const display = s.length > 60 ? s.slice(0, 60) + "…" : s;
            return (
              <div key={k} style={{
                display: "inline-flex", alignItems: "baseline", gap: 4,
                background: "var(--bg-surface)", borderRadius: 4, padding: "2px 6px",
                fontFamily: "monospace", fontSize: 11, maxWidth: "100%",
              }} title={s}>
                <span style={{ color: "var(--accent-soft)" }}>{k}</span>
                <span style={{ color: "var(--text-fainter)" }}>=</span>
                <span style={{ color: "var(--frame-value)", wordBreak: "break-all" }}>{display}</span>
              </div>
            );
          })}
          {heap.map(([k]) => (
            <div key={k} style={{
              display: "inline-flex", alignItems: "baseline", gap: 4,
              background: "var(--bg-surface)", borderRadius: 4, padding: "2px 6px",
              fontFamily: "monospace", fontSize: 11,
              border: "1px dashed var(--text-fainter)",
            }} title={`${k} → see Objects panel`}>
              <span style={{ color: "var(--accent-soft)" }}>{k}</span>
              <span style={{ color: "var(--text-faint)" }}>→</span>
              <span style={{ color: "var(--json-bool)" }}>{Array.isArray(scope[k]) ? "array" : "object"}</span>
            </div>
          ))}
        </div>
      </div>

      {heap.length > 0 && (
        <div>
          <div style={{ color: "var(--text-muted)", fontSize: 10, marginBottom: 5, textTransform: "uppercase", letterSpacing: 1 }}>Objects</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {heap.map(([k, v]) => (
              <div key={k} style={{
                background: "var(--bg-surface)", borderRadius: 6, padding: "6px 10px",
                border: "1px solid var(--bg-panel)",
              }}>
                <div style={{ color: "var(--accent-soft)", fontFamily: "monospace", fontSize: 11, marginBottom: 4 }}>{k}</div>
                <pre style={{ margin: 0, fontFamily: "ui-monospace, monospace", fontSize: 11, lineHeight: 1.4, whiteSpace: "pre", overflowX: "auto" }}>
                  <JsonView value={v} />
                </pre>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Lightweight inline-markup renderer for annotation bodies: supports
// `inline code` (backticks) and **bold** (double-asterisks). Splits the
// string on either pattern and renders each fragment in a styled span.
function renderAnnotationBody(text) {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={i} style={{
          background: "var(--bg-surface)",
          padding: "1px 5px",
          borderRadius: 3,
          fontFamily: "ui-monospace, monospace",
          fontSize: 12,
          color: "var(--text)",
        }}>{part.slice(1, -1)}</code>
      );
    }
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} style={{ color: "var(--text)" }}>{part.slice(2, -2)}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
}

// Small uppercase "Copy" button shared by the script editor, input editor, and
// final output. Flashes "Copied" on success. Silently no-ops if clipboard
// access is denied (some embedded contexts disable it).
function CopyButton({ getText, label = "Copy" }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async (e) => {
    e.stopPropagation(); // don't toggle the collapse if we live inside a button-shaped header
    try {
      await navigator.clipboard.writeText(getText());
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch { /* clipboard unavailable */ }
  };
  return (
    <button
      onClick={onCopy}
      title="Copy to clipboard"
      style={{
        background: copied ? "var(--text-output-label)" : "transparent",
        color: copied ? "#fff" : "var(--text-muted)",
        border: "1px solid var(--border)",
        borderRadius: 3,
        padding: "1px 7px",
        fontSize: 10,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: 1,
        cursor: "pointer",
        fontFamily: "ui-monospace, monospace",
        transition: "background 120ms, color 120ms",
      }}
    >{copied ? "Copied" : label}</button>
  );
}

function btn(disabled) {
  return {
    background: disabled ? "var(--button-bg-disabled)" : "var(--button-bg)",
    color: disabled ? "var(--text-fainter)" : "var(--button-text)",
    border: "1px solid var(--border)",
    borderRadius: 5,
    padding: "4px 10px",
    fontSize: 12,
    fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer",
  };
}

const initialTheme = () => {
  try {
    const saved = localStorage.getItem("dw-theme");
    if (saved === "light" || saved === "dark") return saved;
  } catch { /* localStorage unavailable */ }
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
};

export default function App() {
  const [code, setCode] = useState(SAMPLE);
  const [input, setInput] = useState(SAMPLE_INPUT);
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState("line"); // "line" = step source-line by source-line; "event" = step AST-node by AST-node
  const [scrollTop, setScrollTop] = useState(0);
  const [theme, setTheme] = useState(initialTheme);
  const [dragging, setDragging] = useState(false);
  const [loadedSampleId, setLoadedSampleId] = useState(DEFAULT_SAMPLE.id);
  const [selectedMime, setSelectedMime] = useState("application/json");
  const [uiMode, setUiMode] = useState("lessons"); // "lessons" = chapter walkthroughs; "playground" = free-form editor
  // Stash of the playground editor's contents while the user is in Lessons mode,
  // so flipping back to Playground restores their work. Seeded with the Recipe
  // sample on first load — it's still in SAMPLES_BY_ID even though we filter
  // it out of the dropdown.
  const [playgroundStash, setPlaygroundStash] = useState(() => {
    const recipe = SAMPLES_BY_ID["intro-receipt"];
    return recipe
      ? { code: recipe.script, input: JSON.stringify(recipe.payload, null, 2) }
      : { code: "%dw 2.0\n---\n{}", input: "{}" };
  });
  const [aboutCollapsedById, setAboutCollapsedById] = useState(() => {
    try { return JSON.parse(localStorage.getItem("dw-about-collapsed") || "{}"); }
    catch { return {}; }
  });
  // Playground caveat banner — dismissible, sticks via localStorage.
  const [playgroundWarningDismissed, setPlaygroundWarningDismissed] = useState(() => {
    try { return localStorage.getItem("dw-playground-warning-dismissed") === "true"; }
    catch { return false; }
  });
  const dismissPlaygroundWarning = () => {
    setPlaygroundWarningDismissed(true);
    try { localStorage.setItem("dw-playground-warning-dismissed", "true"); } catch { /* ignore */ }
  };
  // Draggable layout splits.
  // - leftWidthPct: how wide the left pane is, as a % of the body's width
  // - scriptFlexPct: how tall the Script section is, as a % of the
  //   (script + input) flex zone (the nav bar at the bottom keeps natural height).
  const [leftWidthPct, setLeftWidthPct] = useState(42);
  const [scriptFlexPct, setScriptFlexPct] = useState(71); // ≈ original 2.5/(2.5+1)
  const [hSplitDragging, setHSplitDragging] = useState(false); // left/right
  const [vSplitDragging, setVSplitDragging] = useState(false); // script/input
  const bodyRef = useRef(null);
  const leftEditorZoneRef = useRef(null);
  const aboutCollapsed = !!aboutCollapsedById[loadedSampleId];
  // Step-card body collapse. Auto-folds on entering the last step (so the
  // Final Output below grabs focus), auto-unfolds on leaving it. User can
  // toggle manually in between — the next entry/exit transition resets it.
  const [stepCardCollapsed, setStepCardCollapsed] = useState(false);
  const prevIsLastStepRef = useRef(false);
  // Width of the script textarea's *content area* (clientWidth minus padding).
  // Used to figure out how many visual rows each logical line wraps into,
  // which in turn drives the gutter's per-line heights so one logical line
  // gets one line number even when its text wraps over multiple visual rows.
  const [codeContentWidth, setCodeContentWidth] = useState(0);
  const toggleAbout = () => {
    setAboutCollapsedById((m) => {
      const next = { ...m, [loadedSampleId]: !m[loadedSampleId] };
      try { localStorage.setItem("dw-about-collapsed", JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };
  const codeRef = useRef(null);
  const sliderRef = useRef(null);

  const loadSample = (id) => {
    const s = SAMPLES_BY_ID[id];
    if (!s) return;
    setCode(s.script);
    setInput(JSON.stringify(s.payload, null, 2));
    setStep(0);
    setLoadedSampleId(id);
    // Reset MIME selection so each lesson opens on JSON (or the first mocked
    // format if json isn't provided).
    const firstMime = s.mockedOutputs ? (Object.keys(s.mockedOutputs)[0] || "application/json") : "application/json";
    setSelectedMime(firstMime);
  };
  const loadedSample = SAMPLES_BY_ID[loadedSampleId];
  // Concept lessons lock their script + input so the walkthrough stays on rails.
  // In Playground mode editors are always unlocked even if a lesson is "loaded".
  const isLessonLocked = uiMode === "lessons" && !!loadedSample?.annotations;
  const isLessonView   = uiMode === "lessons";

  // Switch between Lessons and Playground, swapping the editor contents.
  const switchUiMode = (next) => {
    if (next === uiMode) return;
    if (next === "playground") {
      // Save the current editor state (only matters if user was editing an
      // unlocked lesson) and pop the stashed playground state into the editor.
      setCode(playgroundStash.code);
      setInput(playgroundStash.input);
    } else {
      // Stash playground edits and reload the active lesson into the editor.
      setPlaygroundStash({ code, input });
      const s = SAMPLES_BY_ID[loadedSampleId];
      if (s) {
        setCode(s.script);
        setInput(JSON.stringify(s.payload, null, 2));
      }
    }
    setStep(0);
    setUiMode(next);
  };

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem("dw-theme", theme); } catch { /* ignore */ }
  }, [theme]);

  const compiled = useMemo(() => {
    try {
      const tokens = tokenize(code);
      const ast = parse(tokens);
      const payload = JSON.parse(input);
      const { result, trace } = evaluate(ast, payload);
      return { ok: true, ast, tokens, result, trace };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }, [code, input]);

  const trace = useMemo(() => compiled.trace || [], [compiled.trace]);
  const safeStep = Math.min(step, Math.max(trace.length - 1, 0));
  const current = trace[safeStep];

  // Line-level stepping: list of line-step boundaries. In line mode, nav
  // controls hop between these instead of every AST event.
  const lineSteps = useMemo(() => buildLineSteps(trace), [trace]);
  const lineIdx = useMemo(() => lineIndexForStep(lineSteps, safeStep), [lineSteps, safeStep]);

  // The "next line to execute" arrow target. In line mode it's the next
  // line-step's line; in event mode it's the next trace event's line.
  const nextLine = mode === "line"
    ? lineSteps[lineIdx + 1]?.line
    : trace[safeStep + 1]?.line;

  const total = mode === "line" ? lineSteps.length : trace.length;
  const cursor = mode === "line" ? lineIdx : safeStep;
  const atStart = cursor === 0;
  const atEnd = cursor >= total - 1;
  const isLastStep = safeStep === Math.max(trace.length - 1, 0);

  // Concept-lesson annotation: the entry whose lineRange covers current.line.
  // Cheap (n < ~10 entries), not worth memoising.
  const activeAnnotation = loadedSample?.annotations && current?.line
    ? loadedSample.annotations.find((a) => current.line >= a.lineRange[0] && current.line <= a.lineRange[1])
    : null;

  const setCursor = (i) => {
    const clamped = Math.max(0, Math.min(total - 1, i));
    if (mode === "line") setStep(lineSteps[clamped]?.traceIndex ?? 0);
    else setStep(clamped);
  };
  const goFirst = () => setCursor(0);
  const goPrev  = () => setCursor(cursor - 1);
  const goNext  = () => setCursor(cursor + 1);
  const goLast  = () => setCursor(total - 1);

  // Auto-collapse the step body when we land on the last step so the Final
  // Output (which appears at the same time) gets the visual focus.
  useEffect(() => {
    if (isLastStep && !prevIsLastStepRef.current) setStepCardCollapsed(true);
    else if (!isLastStep && prevIsLastStepRef.current) setStepCardCollapsed(false);
    prevIsLastStepRef.current = isLastStep;
  }, [isLastStep]);

  // Track the script textarea's content width via ResizeObserver, so the
  // gutter recomputes wrap-aware line heights whenever the editor is resized
  // (panel resize, theme/font tweaks, etc.).
  useEffect(() => {
    const ta = codeRef.current;
    if (!ta || typeof ResizeObserver === "undefined") return;
    const update = () => setCodeContentWidth(Math.max(0, ta.clientWidth - 2 * PADDING));
    update();
    const obs = new ResizeObserver(update);
    obs.observe(ta);
    return () => obs.disconnect();
  }, []);

  // Per-logical-line heights of the script editor. Recomputed when the code
  // text or the textarea's content width changes.
  const lineHeights = useMemo(() => {
    const lines = code.split("\n");
    return lines.map((line) => visualRowsForLine(line, codeContentWidth) * LINE_PX);
  }, [code, codeContentWidth]);
  const lineTopOf = (n) => {
    let y = PADDING;
    for (let i = 0; i < (n - 1) && i < lineHeights.length; i++) y += lineHeights[i];
    return y;
  };

  // Keep the just-executed line visible when stepping. Smooth-scroll the
  // textarea; its onScroll already syncs the gutter. Uses lineTopOf so the
  // calculation respects wrapped lines.
  useEffect(() => {
    const ta = codeRef.current;
    if (!ta || !current?.line) return;
    const lineY = lineTopOf(current.line);
    const margin = LINE_PX * 2;
    const top = ta.scrollTop;
    const bottom = top + ta.clientHeight;
    if (lineY < top + margin) {
      ta.scrollTo({ top: Math.max(0, lineY - margin), behavior: "smooth" });
    } else if (lineY > bottom - margin) {
      ta.scrollTo({ top: lineY - ta.clientHeight + margin, behavior: "smooth" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.line]);

  return (
    <div style={{
      height: "100vh",
      display: "flex",
      flexDirection: "column",
      background: "var(--bg-surface)",
      color: "var(--text)",
      fontFamily: "system-ui, sans-serif",
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        background: "var(--bg-panel)",
        padding: "6px 14px",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        gap: 10,
        flexShrink: 0,
      }}>
        <img src="/dw-visualiser.png" alt="" width="22" height="22" style={{ display: "block" }} />
        <div style={{ fontWeight: 700, fontSize: 13 }}>DataWeave Visualiser</div>
        <a
          href="https://github.com/Amanagg4078/dw-visualiser/tree/main"
          target="_blank"
          rel="noopener noreferrer"
          title="View source on GitHub"
          aria-label="View source on GitHub"
          style={{
            display: "inline-flex",
            alignItems: "center",
            color: "var(--text-muted)",
            textDecoration: "none",
            padding: "2px 4px",
            borderRadius: 4,
            marginLeft: 2,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>
          </svg>
        </a>
        <div style={{ display: "inline-flex", borderRadius: 4, border: "1px solid var(--border)", overflow: "hidden", marginLeft: 6, fontSize: 10 }}>
          {[
            { id: "lessons",    label: "Lessons" },
            { id: "playground", label: "Playground" },
          ].map((m) => (
            <button
              key={m.id}
              onClick={() => switchUiMode(m.id)}
              style={{
                background: uiMode === m.id ? "var(--accent)" : "transparent",
                color: uiMode === m.id ? "#fff" : "var(--text-muted)",
                border: "none",
                padding: "3px 10px",
                cursor: "pointer",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: 1,
              }}
            >{m.label}</button>
          ))}
        </div>
        {isLessonView && (
          <select
            value={loadedSampleId}
            onChange={(e) => loadSample(e.target.value)}
            title="Load a tutorial lesson"
            style={{
              background: "var(--button-bg)",
              color: "var(--button-text)",
              border: "1px solid var(--border)",
              borderRadius: 4,
              padding: "3px 8px",
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {(() => {
              // Group by chapter (leading digit of the `chapter` field).
              // Playground-only samples (no annotations) are filtered out here —
              // they're reachable via the Playground mode toggle instead.
              const groups = new Map();
              for (const s of SAMPLES) {
                if (!s.annotations) continue;
                const m = /^(\d+)/.exec(s.chapter || "");
                const key = m ? `Chapter ${m[1]}` : "Other";
                if (!groups.has(key)) groups.set(key, []);
                groups.get(key).push(s);
              }
              return Array.from(groups, ([label, items]) => (
                <optgroup key={label} label={label}>
                  {items.map((s) => (
                    <option key={s.id} value={s.id}>{s.chapter} — {s.title}</option>
                  ))}
                </optgroup>
              ));
            })()}
          </select>
        )}
        {isLessonView && loadedSample?.tutorialUrl && (
          <a
            href={loadedSample.tutorialUrl}
            target="_blank"
            rel="noopener noreferrer"
            title={loadedSample.description}
            style={{
              color: "var(--accent-soft)",
              fontSize: 11,
              textDecoration: "none",
              padding: "2px 6px",
              borderRadius: 3,
              border: "1px dashed var(--border)",
            }}
          >
            tutorial ↗
          </a>
        )}
        <div style={{ marginLeft: "auto", display: "flex", gap: 14, fontSize: 11, alignItems: "center" }}>
          {uiMode === "playground" && (
            <span
              role="img"
              aria-label="Playground caveat"
              title={[
                "Heads up — this isn't a real DataWeave runtime.",
                "",
                "The Playground simulates a slice of DataWeave (lessons 1–8) as a learner tool:",
                "• No dw::core::Strings / Arrays libraries — only the lesson-covered built-ins.",
                "• JSON input/output only — no XML / CSV / YAML.",
                "• Approximation — may diverge from the official engine.",
              ].join("\n")}
              style={{
                color: "var(--arrow-red)",
                cursor: "help",
                fontSize: 14,
                lineHeight: 1,
                userSelect: "none",
              }}
            >⚠️</span>
          )}
          {compiled.ok && (
            <span style={{ color: "var(--text-muted)" }}>Events: <b style={{ color: "var(--accent-soft)" }}>{trace.length}</b></span>
          )}
          <button
            onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
            title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            aria-label="Toggle theme"
            style={{
              background: "transparent",
              border: "1px solid var(--border)",
              color: "var(--text)",
              borderRadius: 4,
              padding: "3px 10px",
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
              lineHeight: 1.2,
            }}
          >
            Toggle theme
          </button>
        </div>
      </div>

      {/* Body */}
      <div
        ref={bodyRef}
        style={{ display: "flex", flex: 1, overflow: "hidden", minHeight: 0 }}
        onPointerMove={(e) => {
          if (hSplitDragging && bodyRef.current) {
            const rect = bodyRef.current.getBoundingClientRect();
            const pct = ((e.clientX - rect.left) / rect.width) * 100;
            setLeftWidthPct(Math.max(20, Math.min(80, pct)));
          }
          if (vSplitDragging && leftEditorZoneRef.current) {
            const rect = leftEditorZoneRef.current.getBoundingClientRect();
            const pct = ((e.clientY - rect.top) / rect.height) * 100;
            setScriptFlexPct(Math.max(15, Math.min(90, pct)));
          }
        }}
        onPointerUp={() => { setHSplitDragging(false); setVSplitDragging(false); }}
      >
        {/* LEFT: script + input + nav */}
        <div style={{
          width: `${leftWidthPct}%`,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          minHeight: 0,
        }}>
          {/* The flex zone shared by Script + Input (everything except the */}
          {/* fixed-height nav bar). We measure this for the script/input split. */}
          <div ref={leftEditorZoneRef} style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 }}>
          {/* Script section */}
          <div style={{
            flex: `${scriptFlexPct} 1 0`,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            minHeight: 0,
          }}>
            <SectionLabel right={
              <span style={{ display: "inline-flex", gap: 10, alignItems: "center" }}>
                <span><span style={{ color: ARROW_GREEN, fontWeight: 700 }}>▶</span> just executed</span>
                <span><span style={{ color: ARROW_RED, fontWeight: 700 }}>▶</span> next</span>
                <CopyButton getText={() => code} />
              </span>
            }>📝 Script</SectionLabel>
            <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>
              <ScriptGutter
                lineHeights={lineHeights}
                prevLine={current?.line}
                nextLine={nextLine}
                scrollTop={scrollTop}
              />
              <textarea
                ref={codeRef}
                value={code}
                onChange={(e) => { setCode(e.target.value); setStep(0); }}
                onScroll={(e) => setScrollTop(e.target.scrollTop)}
                onKeyDown={(e) => handleAutoClose(e, setCode, setStep)}
                readOnly={isLessonLocked}
                spellCheck={false}
                title={isLessonLocked ? "Locked — concept lessons use a fixed script. Pick a Recipe or Selector sample from the dropdown to edit freely." : undefined}
                style={{
                  flex: 1,
                  background: "var(--bg-surface)",
                  color: "var(--text)",
                  border: "none",
                  padding: PADDING,
                  fontFamily: "ui-monospace, monospace",
                  fontSize: FONT_SIZE,
                  resize: "none",
                  outline: "none",
                  lineHeight: LINE_HEIGHT,
                  minHeight: 0,
                  cursor: isLessonLocked ? "default" : "text",
                  opacity: isLessonLocked ? 0.92 : 1,
                }}
              />
            </div>
          </div>

          {/* Horizontal splitter between Script and Input. Drag to resize. */}
          <div
            onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setVSplitDragging(true); }}
            title="Drag to resize"
            style={{
              flex: "0 0 5px",
              cursor: "row-resize",
              background: vSplitDragging ? "var(--accent)" : "var(--border)",
              transition: "background 120ms",
              touchAction: "none",
            }}
          />
          {/* Input section */}
          <div style={{
            flex: `${100 - scriptFlexPct} 1 0`,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            minHeight: 0,
          }}>
            <SectionLabel right={
              <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                {isLessonLocked && <span style={{ color: "var(--text-faint)", textTransform: "none", letterSpacing: 0 }}>locked</span>}
                <CopyButton getText={() => input} />
              </span>
            }>📥 Input (JSON)</SectionLabel>
            <textarea
              value={input}
              onChange={(e) => { setInput(e.target.value); setStep(0); }}
              onKeyDown={(e) => handleAutoClose(e, setInput, setStep)}
              readOnly={isLessonLocked}
              spellCheck={false}
              style={{
                flex: 1,
                background: "var(--bg-surface)",
                color: "var(--text)",
                border: "none",
                padding: PADDING,
                fontFamily: "ui-monospace, monospace",
                fontSize: FONT_SIZE,
                resize: "none",
                outline: "none",
                lineHeight: LINE_HEIGHT,
                minHeight: 0,
                cursor: isLessonLocked ? "default" : "text",
                opacity: isLessonLocked ? 0.92 : 1,
              }}
            />
          </div>
          </div>{/* end leftEditorZoneRef */}

          {/* Nav controls */}
          {compiled.ok && trace.length > 0 && (
            <div style={{
              padding: "8px 10px",
              flexShrink: 0,
              background: "var(--bg-panel)",
              borderTop: "1px solid var(--border)",
            }}>
              {/* Mode toggle + counter row */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <div style={{ display: "inline-flex", borderRadius: 4, border: "1px solid var(--text-fainter)", overflow: "hidden", fontSize: 10 }}>
                  {[
                    { id: "line",  label: "Line",  tip: "Step source-line by source-line — one click moves the cursor to the next line of the script. Best for learning the flow." },
                    { id: "event", label: "Event", tip: "Step AST-event by AST-event — finer-grained, shows every lookup, operator, and sub-expression. Useful for digging into how the engine evaluates." },
                  ].map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setMode(m.id)}
                      title={m.tip}
                      style={{
                        background: mode === m.id ? "var(--accent)" : "transparent",
                        color: mode === m.id ? "#fff" : "var(--text-muted)",
                        border: "none",
                        padding: "3px 10px",
                        cursor: "pointer",
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: 1,
                      }}
                    >{m.label}</button>
                  ))}
                </div>
                <span style={{ color: "var(--text-muted)", fontSize: 11, marginLeft: "auto" }}>
                  {mode === "line" ? "Line" : "Step"} {cursor + 1} / {total}
                </span>
              </div>

              <div
                ref={sliderRef}
                style={{
                  position: "relative",
                  height: 14, // taller hit area for grabbing
                  display: "flex",
                  alignItems: "center",
                  cursor: dragging ? "grabbing" : "pointer",
                  marginBottom: 8,
                  touchAction: "none",
                }}
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  setDragging(true);
                  const r = e.currentTarget.getBoundingClientRect();
                  setCursor(Math.round(((e.clientX - r.left) / r.width) * (total - 1)));
                }}
                onPointerMove={(e) => {
                  if (!dragging) return;
                  const r = e.currentTarget.getBoundingClientRect();
                  const pct = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
                  setCursor(Math.round(pct * (total - 1)));
                }}
                onPointerUp={(e) => {
                  e.currentTarget.releasePointerCapture(e.pointerId);
                  setDragging(false);
                }}
                onPointerCancel={() => setDragging(false)}
              >
                <div style={{ position: "absolute", left: 0, right: 0, height: 4, background: "var(--bg-surface)", borderRadius: 3 }} />
                <div style={{
                  position: "absolute",
                  left: 0,
                  height: 4,
                  width: `${(cursor / Math.max(total - 1, 1)) * 100}%`,
                  background: "var(--accent)",
                  borderRadius: 3,
                  transition: dragging ? "none" : "width 150ms ease-out",
                }} />
                <div style={{
                  position: "absolute",
                  left: `${(cursor / Math.max(total - 1, 1)) * 100}%`,
                  transform: "translateX(-50%)",
                  width: 14,
                  height: 14,
                  background: "var(--accent)",
                  borderRadius: "50%",
                  border: "2px solid var(--bg-panel)",
                  boxShadow: dragging ? "0 0 0 4px color-mix(in srgb, var(--accent) 25%, transparent)" : "none",
                  transition: dragging ? "none" : "left 150ms ease-out, box-shadow 120ms",
                }} />
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <button onClick={goFirst} disabled={atStart} style={btn(atStart)}>⏮</button>
                <button onClick={goPrev}  disabled={atStart} style={btn(atStart)}>◀ Prev</button>
                <div style={{ flex: 1 }} />
                <button onClick={goNext}  disabled={atEnd}   style={btn(atEnd)}>Next ▶</button>
                <button onClick={goLast}  disabled={atEnd}   style={btn(atEnd)}>⏭</button>
              </div>
            </div>
          )}
        </div>

        {/* Vertical splitter between left pane and right pane. Drag to resize. */}
        <div
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setHSplitDragging(true); }}
          title="Drag to resize"
          style={{
            flex: "0 0 5px",
            cursor: "col-resize",
            background: hSplitDragging ? "var(--accent)" : "var(--border)",
            transition: "background 120ms",
            touchAction: "none",
          }}
        />

        {/* RIGHT: step card + final output */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 }}>
          {!compiled.ok ? (
            <div style={{
              padding: 18,
              color: "var(--text-error)",
              background: "var(--bg-error)",
              margin: 14,
              borderRadius: 8,
              border: "1px solid var(--border-error)",
              fontFamily: "monospace",
              fontSize: 13,
            }}>
              ❌ <b>Parse / runtime error</b><br /><br />{compiled.error}
            </div>
          ) : (
            <div style={{ flex: 1, overflowY: "auto", padding: 14, minHeight: 0 }}>
              {/* Playground caveat — only in playground mode, dismissable. */}
              {uiMode === "playground" && !playgroundWarningDismissed && (
                <div style={{
                  background: "var(--bg-error)",
                  border: "1px solid var(--arrow-red)",
                  borderLeft: "4px solid var(--arrow-red)",
                  borderRadius: 8,
                  padding: "10px 12px",
                  marginBottom: 14,
                  fontSize: 12,
                  lineHeight: 1.55,
                  color: "var(--text-muted)",
                  position: "relative",
                }}>
                  <button
                    onClick={dismissPlaygroundWarning}
                    title="Dismiss"
                    aria-label="Dismiss warning"
                    style={{
                      position: "absolute",
                      top: 6,
                      right: 8,
                      background: "transparent",
                      color: "var(--text-error)",
                      border: "none",
                      cursor: "pointer",
                      fontSize: 16,
                      lineHeight: 1,
                      padding: "2px 6px",
                    }}
                  >×</button>
                  <div style={{ color: "var(--arrow-red)", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
                    Heads up — this isn't a real DataWeave runtime
                  </div>
                  <div>
                    This Playground is a <strong>learner tool</strong> that simulates a slice of DataWeave to step through what the tutorial covers. Scope: only the language features shown in lessons 1–8.
                  </div>
                  <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                    <li>No DataWeave libraries (`dw::core::Strings`, `dw::core::Arrays`, etc.) — only the lesson-covered built-ins.</li>
                    <li>Only JSON input and output. XML / CSV / YAML aren't supported.</li>
                    <li>There may be bugs or semantic gaps — this is an approximation, not the official engine.</li>
                  </ul>
                </div>
              )}
              {isLessonView && loadedSample?.description && (
                <div style={{
                  background: "var(--bg-panel)",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  marginBottom: 14,
                  overflow: "hidden",
                }}>
                  <button
                    onClick={toggleAbout}
                    style={{
                      width: "100%",
                      background: "transparent",
                      border: "none",
                      padding: "8px 12px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      cursor: "pointer",
                      color: "var(--text)",
                      fontSize: 11,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: 1,
                    }}
                    aria-expanded={!aboutCollapsed}
                  >
                    <span>About {loadedSample.chapter} · <span style={{ textTransform: "none", letterSpacing: 0, color: "var(--text-muted)", fontWeight: 500 }}>{loadedSample.title}</span></span>
                    <span style={{ color: "var(--text-faint)", fontSize: 12 }}>{aboutCollapsed ? "▸" : "▾"}</span>
                  </button>
                  {!aboutCollapsed && (
                    <div style={{ padding: "0 12px 12px", fontSize: 13, lineHeight: 1.55, color: "var(--text-muted)" }}>
                      {renderAnnotationBody(loadedSample.description)}
                      {loadedSample.tutorialUrl && (
                        <div style={{ marginTop: 8 }}>
                          <a
                            href={loadedSample.tutorialUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: "var(--accent-soft)", fontSize: 11, textDecoration: "none" }}
                          >
                            Read the official tutorial ↗
                          </a>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
              {isLessonView && activeAnnotation && (
                <div style={{
                  background: "var(--bg-panel)",
                  border: "2px solid var(--accent)",
                  borderRadius: 10,
                  padding: 14,
                  marginBottom: 14,
                  boxShadow: "0 0 0 4px color-mix(in srgb, var(--accent) 12%, transparent)",
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                    <span style={{
                      background: "var(--accent)",
                      color: "#fff",
                      fontSize: 10,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: 1,
                      padding: "2px 8px",
                      borderRadius: 4,
                    }}>
                      Lesson {loadedSample.chapter}
                    </span>
                    <span style={{ color: "var(--text-faint)", fontSize: 11, fontStyle: "italic" }}>
                      {loadedSample.title}
                    </span>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6, color: "var(--text)" }}>
                    {activeAnnotation.title}
                  </div>
                  <p style={{ fontSize: 13, margin: 0, lineHeight: 1.55, color: "var(--text-muted)" }}>
                    {renderAnnotationBody(activeAnnotation.body)}
                  </p>
                </div>
              )}
              {current && (
                <div style={{
                  background: "var(--bg-panel)",
                  borderRadius: 10,
                  padding: 14,
                  border: `1px solid ${PHASE_COLORS[current.phase] ? PHASE_COLORS[current.phase] + "55" : "var(--border)"}`,
                  marginBottom: 14,
                }}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setStepCardCollapsed((c) => !c)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setStepCardCollapsed((c) => !c); }}
                    title={stepCardCollapsed ? "Show step details" : "Hide step details"}
                    style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: stepCardCollapsed ? 0 : 10, cursor: "pointer", userSelect: "none" }}
                  >
                    <span style={{
                      background: PHASE_COLORS[current.phase] || "var(--border)",
                      color: "#fff",
                      borderRadius: 6,
                      padding: "2px 10px",
                      fontSize: 10,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: 1,
                    }}>
                      {current.phase}
                    </span>
                    <span style={{ color: "var(--text-faint)", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 6 }}>
                      Step {safeStep + 1} / {trace.length}
                      <span style={{ color: "var(--text-muted)", fontSize: 11 }}>{stepCardCollapsed ? "▸" : "▾"}</span>
                    </span>
                  </div>

                  {!stepCardCollapsed && (
                    <>
                      <p style={{ color: "var(--text)", fontSize: 14, margin: "0 0 10px", lineHeight: 1.5 }}>{current.description}</p>

                      {current.value !== undefined && (
                        <div style={{ marginBottom: 10 }}>
                          <div style={{ color: "var(--text-muted)", fontSize: 10, marginBottom: 3, textTransform: "uppercase", letterSpacing: 1 }}>Value</div>
                          <div style={{ background: "var(--bg-surface)", borderRadius: 6, padding: "6px 10px", fontFamily: "monospace", fontSize: 12, color: "var(--text-output)", maxHeight: 180, overflowY: "auto" }}>
                            <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{formatValue(current.value)}</pre>
                          </div>
                        </div>
                      )}

                      <ScopePanel scope={current.scope} />
                    </>
                  )}
                </div>
              )}

              {compiled.result !== undefined && isLastStep && (() => {
                // Mocked outputs (e.g. lesson 1.2) only apply in lesson view.
                const useMocked = isLessonView && loadedSample?.mockedOutputs;
                const copyText = useMocked
                  ? (loadedSample.mockedOutputs[selectedMime] ?? Object.values(loadedSample.mockedOutputs)[0])
                  : dwStringify(compiled.result);
                return (
                  <div style={{ background: "var(--bg-output)", borderRadius: 10, padding: 12, border: "1px solid var(--border-output)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
                      <div style={{ color: "var(--text-output-label)", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>
                        Final Output{useMocked ? <span style={{ marginLeft: 8, color: "var(--text-faint)", fontWeight: 500, textTransform: "none", letterSpacing: 0, fontStyle: "italic" }}>mocked — engine emits JSON only</span> : null}
                      </div>
                      <div style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                        {useMocked && (
                          <div style={{ display: "inline-flex", borderRadius: 4, border: "1px solid var(--border-output)", overflow: "hidden", fontSize: 10 }}>
                            {Object.keys(loadedSample.mockedOutputs).map((mime) => (
                              <button
                                key={mime}
                                onClick={() => setSelectedMime(mime)}
                                style={{
                                  background: selectedMime === mime ? "var(--text-output-label)" : "transparent",
                                  color: selectedMime === mime ? "#fff" : "var(--text-output)",
                                  border: "none",
                                  padding: "3px 8px",
                                  cursor: "pointer",
                                  fontWeight: 600,
                                  fontFamily: "ui-monospace, monospace",
                                }}
                              >{mime.replace("application/", "")}</button>
                            ))}
                          </div>
                        )}
                        <CopyButton getText={() => copyText} />
                      </div>
                    </div>
                    <pre style={{ margin: 0, fontFamily: "ui-monospace, monospace", fontSize: 12, lineHeight: 1.5, whiteSpace: "pre", overflowX: "auto", color: "var(--text-output)" }}>
                      {useMocked
                        ? (loadedSample.mockedOutputs[selectedMime] ?? loadedSample.mockedOutputs[Object.keys(loadedSample.mockedOutputs)[0]])
                        : <JsonView value={compiled.result} />}
                    </pre>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
