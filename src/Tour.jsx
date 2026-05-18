import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

// First-time-user product tour. Two persisted keys:
//   `dw-welcome-seen`  — set when tour finishes OR user clicks Skip; the
//                        flag never auto-opens again. Cleared by manual
//                        ?-button reopen, then re-set on close.
//   `dw-tour-step`     — current step index, written on every step change
//                        so a mid-tour refresh resumes at the same spot.
// Steps with no `selector` are full-screen modal cards (welcome / finish);
// steps with a selector spotlight that element and anchor a tooltip
// relative to it. Anchored steps whose target isn't in the DOM (e.g. the
// lesson dropdown when in Playground mode) auto-skip forward.
const TOUR_STEPS = [
  {
    id: "welcome",
    type: "welcome",
    title: "Welcome to the DataWeave Visualiser",
    body: "A step-through teaching tool for DataWeave 2.0. Trace each AST evaluation event, watch the scope evolve, and step through 20+ guided lessons from the official MuleSoft tutorial — or write your own scripts in the Playground. The tour takes ~60 seconds.",
  },
  {
    id: "mode-toggle",
    selector: "[data-tour='mode-toggle']",
    title: "Lessons vs Playground",
    body: "Use Lessons for guided chapter walk-throughs (annotated, locked editors). Use Playground for free-form scripts. Toggle between them any time.",
    side: "bottom",
  },
  {
    id: "lesson-select",
    selector: "[data-tour='lesson-select']",
    title: "Pick a chapter",
    body: "20+ lessons across tutorial chapters 1–8 — selectors, operators, flow control, functions, array & object HOFs. Each one comes with a description and a tutorial link.",
    side: "bottom",
  },
  {
    id: "script-editor",
    selector: "[data-tour='script-editor']",
    title: "Script editor",
    body: "Write DataWeave here. The visualiser re-lex/parses/evaluates on every keystroke. Auto-closing pairs and a yellow line-highlight track where execution is.",
    side: "right",
  },
  {
    id: "input-editor",
    selector: "[data-tour='input-editor']",
    title: "JSON payload",
    body: "Whatever you put here is exposed as `payload` inside the script. Must be valid JSON — errors show inline in the right pane.",
    side: "right",
  },
  {
    id: "gutter",
    selector: "[data-tour='gutter']",
    title: "▶ markers",
    body: "A green ▶ marks the line just executed; a red ▶ marks the line about to run. The editor auto-scrolls to keep them visible.",
    side: "right",
  },
  {
    id: "step-mode",
    selector: "[data-tour='step-mode']",
    title: "Line vs Event stepping",
    body: "Line mode advances one source line at a time — good for following the script. Event mode advances one AST evaluation event at a time — good for seeing how DataWeave reaches each value.",
    side: "top",
  },
  {
    id: "step-controls",
    selector: "[data-tour='step-controls']",
    title: "Step controls",
    body: "Previous / Next walk through the trace. Auto-play runs it at a steady tempo. The slider jumps you anywhere in the timeline.",
    side: "top",
  },
  {
    id: "scope-panel",
    selector: "[data-tour='scope-panel']",
    title: "Scope panel",
    body: "Shows the payload, declared vars, and lambda parameters in scope at the current step — plus the current trace event with its phase, expression, and computed value.",
    side: "left",
  },
  {
    id: "output-panel",
    selector: "[data-tour='output-panel']",
    title: "Final output",
    body: "The result of running the whole script, syntax-coloured. Duplicate keys from `++` merges are preserved here (real DW objects are ordered pair lists). Copy button grabs the rendered text.",
    side: "left",
  },
  {
    id: "header-tools",
    selector: "[data-tour='header-tools']",
    title: "Header tools",
    body: "The ? reopens this tour any time. Toggle theme flips light/dark (persists across sessions). In Playground mode a ⚠️ also appears here — hover it for the scope-vs-real-DW caveats.",
    side: "bottom",
  },
  {
    id: "finish",
    type: "finish",
    title: "You're set",
    body: "That's the whole interface. Hit the ? in the top bar to replay this tour, click around freely, and have fun stepping through some real DataWeave.",
  },
];

const STORAGE_SEEN = "dw-welcome-seen";
const STORAGE_STEP = "dw-tour-step";

// Public hook for App.jsx — owns the open/closed state, persistence, and the
// helpers to open / close. The first auto-open is one-shot (gated by
// STORAGE_SEEN); the `?` button re-opens any time and resets the step.
// `sessionId` bumps on every reopen so the parent can pass it as a React
// `key` and force a fresh Tour mount (avoids a sync-on-open effect inside
// the component).
// eslint-disable-next-line react-refresh/only-export-components
export function useTour() {
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem(STORAGE_SEEN) !== "true"; }
    catch { return true; }
  });
  const [initialStep, setInitialStep] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_STEP);
      const n = raw == null ? 0 : Number(raw);
      return Number.isFinite(n) && n >= 0 && n < TOUR_STEPS.length ? n : 0;
    } catch { return 0; }
  });
  const [sessionId, setSessionId] = useState(0);
  const close = useCallback(() => {
    setOpen(false);
    try {
      localStorage.setItem(STORAGE_SEEN, "true");
      localStorage.removeItem(STORAGE_STEP);
    } catch { /* ignore */ }
    setInitialStep(0);
  }, []);
  const reopen = useCallback(() => {
    setInitialStep(0);
    setOpen(true);
    setSessionId((n) => n + 1);
    try { localStorage.removeItem(STORAGE_STEP); } catch { /* ignore */ }
  }, []);
  const persistStep = useCallback((n) => {
    try { localStorage.setItem(STORAGE_STEP, String(n)); } catch { /* ignore */ }
  }, []);
  return { open, initialStep, sessionId, close, reopen, persistStep };
}

// ---------- positioning helpers ----------

const MARGIN = 14;
const TOOLTIP_WIDTH = 340;
const SPOTLIGHT_PAD = 8;

// Pick the tooltip side with the most available space. `preferred` is a
// hint from the step config; we honour it when there's room, otherwise
// fall back to whichever side actually fits.
function chooseSide(bbox, tooltipH, viewport, preferred) {
  const spaceAbove = bbox.top;
  const spaceBelow = viewport.h - bbox.bottom;
  const spaceLeft = bbox.left;
  const spaceRight = viewport.w - bbox.right;
  const needsHoriz = TOOLTIP_WIDTH + MARGIN * 2;
  const needsVert = tooltipH + MARGIN * 2;
  const fits = {
    top:    spaceAbove >= needsVert,
    bottom: spaceBelow >= needsVert,
    left:   spaceLeft  >= needsHoriz,
    right:  spaceRight >= needsHoriz,
  };
  if (preferred && fits[preferred]) return preferred;
  // Fallback priority: bottom (most natural reading) → top → right → left
  for (const s of ["bottom", "top", "right", "left"]) if (fits[s]) return s;
  // Last resort: pick whichever side has the largest absolute space.
  const all = [
    ["bottom", spaceBelow],
    ["top", spaceAbove],
    ["right", spaceRight],
    ["left", spaceLeft],
  ];
  all.sort((a, b) => b[1] - a[1]);
  return all[0][0];
}

function computePlacement(bbox, tooltipEl, preferred, viewport) {
  const tw = tooltipEl?.offsetWidth || TOOLTIP_WIDTH;
  const th = tooltipEl?.offsetHeight || 160;
  const side = chooseSide(bbox, th, viewport, preferred);
  let top, left;
  if (side === "bottom") {
    top = bbox.bottom + MARGIN;
    left = bbox.left + bbox.width / 2 - tw / 2;
  } else if (side === "top") {
    top = bbox.top - th - MARGIN;
    left = bbox.left + bbox.width / 2 - tw / 2;
  } else if (side === "right") {
    top = bbox.top + bbox.height / 2 - th / 2;
    left = bbox.right + MARGIN;
  } else {
    top = bbox.top + bbox.height / 2 - th / 2;
    left = bbox.left - tw - MARGIN;
  }
  // Clamp inside viewport.
  left = Math.max(MARGIN, Math.min(viewport.w - tw - MARGIN, left));
  top = Math.max(MARGIN, Math.min(viewport.h - th - MARGIN, top));
  return { top, left, side };
}

// Arrow positioning — the little square that visually anchors the
// tooltip to the spotlight target. Returns inline-style props.
function arrowStyle(side) {
  const base = {
    position: "absolute",
    width: 12,
    height: 12,
    background: "var(--bg-panel)",
    borderRight: "1px solid var(--border)",
    borderBottom: "1px solid var(--border)",
  };
  if (side === "bottom") return { ...base, top: -7, left: "50%", transform: "translateX(-50%) rotate(225deg)" };
  if (side === "top")    return { ...base, bottom: -7, left: "50%", transform: "translateX(-50%) rotate(45deg)" };
  if (side === "right")  return { ...base, left: -7, top: "50%", transform: "translateY(-50%) rotate(135deg)" };
  if (side === "left")   return { ...base, right: -7, top: "50%", transform: "translateY(-50%) rotate(-45deg)" };
  return { ...base, display: "none" };
}

// ---------- main component ----------

export default function Tour({ open, initialStep = 0, onClose, onStepChange }) {
  const [stepIdx, setStepIdx] = useState(initialStep);
  const [bbox, setBbox] = useState(null);
  const [placement, setPlacement] = useState({ top: 0, left: 0, side: "bottom" });
  const [mounted, setMounted] = useState(false); // controls the open-anim
  const tooltipRef = useRef(null);

  // Trigger the entry animation on mount. The parent passes a `key` that
  // changes on every reopen, so a fresh mount always starts un-mounted
  // and animates in — no sync-from-prop effect needed.
  useEffect(() => {
    if (!open) return undefined;
    const t = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(t);
  }, [open]);

  const step = TOUR_STEPS[stepIdx];
  const isWelcome = step?.type === "welcome";
  const isFinish = step?.type === "finish";
  const isAnchored = !!step?.selector;
  const total = TOUR_STEPS.length;
  const isLast = stepIdx === total - 1;

  const goNext = useCallback(() => {
    setStepIdx((n) => Math.min(total - 1, n + 1));
  }, [total]);
  const goPrev = useCallback(() => {
    setStepIdx((n) => Math.max(0, n - 1));
  }, []);
  const finish = useCallback(() => { onClose?.(); }, [onClose]);

  // Persist current step on every change. Removed on close (via onClose).
  useEffect(() => {
    if (open) onStepChange?.(stepIdx);
  }, [stepIdx, open, onStepChange]);

  // Keyboard nav. Esc skips out; ←/→ navigate; Enter advances/finishes.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); finish(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); if (isLast) finish(); else goNext(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); goPrev(); }
      else if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (isLast) finish(); else goNext(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, isLast, goNext, goPrev, finish]);

  // Measure the target element for anchored steps. Re-measures on
  // window resize and scroll (capture phase, since the visualiser has
  // several scrolling panes), and auto-scrolls the target into view.
  useLayoutEffect(() => {
    if (!open || !isAnchored) {
      // Intentional reset — welcome / finish steps render no spotlight.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setBbox(null);
      return undefined;
    }
    const target = document.querySelector(step.selector);
    if (!target) {
      // Target absent (e.g. lesson dropdown when Playground is active).
      // Skip past it so the tour doesn't dead-end. Defer via setTimeout
      // so we're not inside the same render cycle when we advance.
      const t = setTimeout(() => {
        setStepIdx((n) => {
          if (n === stepIdx && n < total - 1) return n + 1;
          return n;
        });
      }, 0);
      return () => clearTimeout(t);
    }
    const padded = (r) => ({
      top: r.top - SPOTLIGHT_PAD,
      left: r.left - SPOTLIGHT_PAD,
      width: r.width + SPOTLIGHT_PAD * 2,
      height: r.height + SPOTLIGHT_PAD * 2,
      right: r.right + SPOTLIGHT_PAD,
      bottom: r.bottom + SPOTLIGHT_PAD,
    });
    // Scroll into view first (smooth), then measure after the scroll
    // settles. We re-measure on a short timer to catch the final position.
    const initial = target.getBoundingClientRect();
    const visible = initial.top >= 60 && initial.bottom <= window.innerHeight - 60;
    if (!visible) target.scrollIntoView({ behavior: "smooth", block: "center" });
    const update = () => setBbox(padded(target.getBoundingClientRect()));
    update();
    const settle = setTimeout(update, 380);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      clearTimeout(settle);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, isAnchored, step, stepIdx, total]);

  // Place the tooltip once both the bbox and the rendered tooltip are
  // measurable. Re-positions when bbox or step changes.
  useLayoutEffect(() => {
    if (!isAnchored || !bbox || !tooltipRef.current) return;
    const viewport = { w: window.innerWidth, h: window.innerHeight };
    setPlacement(computePlacement(bbox, tooltipRef.current, step.side, viewport));
  }, [bbox, isAnchored, step]);

  if (!open) return null;

  // ---------- render ----------

  // Welcome / finish are centred modals with no anchored target.
  if (isWelcome || isFinish) {
    return (
      <CenteredCard
        title={step.title}
        body={step.body}
        stepIdx={stepIdx}
        total={total}
        mounted={mounted}
        primary={isWelcome ? {
          label: "Start tour",
          onClick: goNext,
        } : {
          label: "Finish",
          onClick: finish,
        }}
        secondary={isWelcome ? {
          label: "Skip for now",
          onClick: finish,
        } : null}
      />
    );
  }

  return (
    <>
      {/* Click-blocker overlay. Catches any click that isn't on the tooltip. */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "fixed", inset: 0,
          zIndex: 998,
          pointerEvents: "auto",
          cursor: "default",
        }}
      />
      {/* Spotlight rectangle — the box-shadow with massive spread is the
          dim curtain everywhere except this rect. Animated so step
          transitions slide smoothly between targets. */}
      {bbox && (
        <div
          style={{
            position: "fixed",
            top: bbox.top,
            left: bbox.left,
            width: bbox.width,
            height: bbox.height,
            borderRadius: 10,
            pointerEvents: "none",
            boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.62)",
            zIndex: 999,
            transition: "top 320ms cubic-bezier(.4,0,.2,1), left 320ms cubic-bezier(.4,0,.2,1), width 320ms cubic-bezier(.4,0,.2,1), height 320ms cubic-bezier(.4,0,.2,1)",
            animation: "dwTourPulse 2.4s ease-in-out infinite",
          }}
        />
      )}
      {/* Tooltip card with arrow. Position is computed; transitions slide
          it between targets in step with the spotlight. */}
      <div
        ref={tooltipRef}
        style={{
          position: "fixed",
          top: placement.top,
          left: placement.left,
          width: TOOLTIP_WIDTH,
          maxWidth: "calc(100vw - 32px)",
          background: "var(--bg-panel)",
          color: "var(--text)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          padding: 14,
          zIndex: 1001,
          boxShadow: "0 14px 36px rgba(0, 0, 0, 0.35)",
          transition: "top 320ms cubic-bezier(.4,0,.2,1), left 320ms cubic-bezier(.4,0,.2,1), opacity 200ms ease",
          opacity: mounted && bbox ? 1 : 0,
          transform: mounted ? "scale(1)" : "scale(0.96)",
          transformOrigin: "center center",
        }}
      >
        <div style={arrowStyle(placement.side)} aria-hidden="true" />
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          fontSize: 10, fontWeight: 700, color: "var(--accent-soft)",
          textTransform: "uppercase", letterSpacing: 1, marginBottom: 6,
        }}>
          <span>Step {stepIdx} of {total - 1}</span>
          <button
            onClick={finish}
            style={{
              background: "transparent", border: "none",
              color: "var(--text-muted)", cursor: "pointer",
              fontSize: 11, fontWeight: 600, padding: "0 0 0 8px",
              textTransform: "uppercase", letterSpacing: 0.5,
            }}
          >Skip tour</button>
        </div>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{step.title}</div>
        <div style={{ fontSize: 12, lineHeight: 1.55, color: "var(--text-muted)" }}>
          {step.body}
        </div>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          marginTop: 12, gap: 8,
        }}>
          <ProgressDots count={total} active={stepIdx} onJump={(i) => setStepIdx(i)} />
          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={goPrev}
              disabled={stepIdx === 0}
              style={{
                background: "transparent",
                color: stepIdx === 0 ? "var(--text-faint)" : "var(--text)",
                border: "1px solid var(--border)",
                borderRadius: 4,
                padding: "4px 10px",
                fontSize: 12,
                cursor: stepIdx === 0 ? "not-allowed" : "pointer",
                fontWeight: 600,
              }}
            >Previous</button>
            <button
              onClick={isLast ? finish : goNext}
              style={{
                background: "var(--accent)",
                color: "#fff",
                border: "none",
                borderRadius: 4,
                padding: "4px 14px",
                fontSize: 12,
                cursor: "pointer",
                fontWeight: 700,
              }}
            >{isLast ? "Finish" : "Next"}</button>
          </div>
        </div>
      </div>
      {/* Pulse keyframes injected once — kept inline so the tour is self
          contained and doesn't require global stylesheet additions. */}
      <style>{`
        @keyframes dwTourPulse {
          0%, 100% { outline: 2px solid rgba(99, 179, 237, 0.0); outline-offset: 2px; }
          50%      { outline: 2px solid rgba(99, 179, 237, 0.55); outline-offset: 4px; }
        }
        @keyframes dwTourPop {
          from { opacity: 0; transform: scale(0.94) translateY(8px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </>
  );
}

// ---------- subcomponents ----------

function ProgressDots({ count, active, onJump }) {
  return (
    <div style={{ display: "flex", gap: 5 }}>
      {Array.from({ length: count }).map((_, i) => (
        <button
          key={i}
          onClick={() => onJump?.(i)}
          aria-label={`Go to step ${i}`}
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            border: "none",
            padding: 0,
            background: i === active ? "var(--accent)" : "var(--border)",
            cursor: "pointer",
            transition: "background 200ms, transform 200ms",
            transform: i === active ? "scale(1.4)" : "scale(1)",
          }}
        />
      ))}
    </div>
  );
}

function CenteredCard({ title, body, stepIdx, total, mounted, primary, secondary }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(0, 0, 0, 0.58)",
        zIndex: 1000,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
        animation: "dwTourPop 240ms ease",
      }}
    >
      <div
        style={{
          background: "var(--bg-panel)",
          color: "var(--text)",
          border: "1px solid var(--border)",
          borderRadius: 14,
          padding: 22,
          maxWidth: 520, width: "100%",
          boxShadow: "0 24px 60px rgba(0, 0, 0, 0.45)",
          opacity: mounted ? 1 : 0,
          transform: mounted ? "scale(1) translateY(0)" : "scale(0.96) translateY(8px)",
          transition: "opacity 240ms ease, transform 240ms cubic-bezier(.4,0,.2,1)",
        }}
      >
        <div style={{
          fontSize: 10, fontWeight: 700, color: "var(--accent-soft)",
          textTransform: "uppercase", letterSpacing: 1, marginBottom: 6,
        }}>
          {stepIdx === 0 ? "Quick tour · 60 seconds" : `Step ${stepIdx} of ${total - 1} · done`}
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>{title}</div>
        <div style={{ fontSize: 13, lineHeight: 1.55, color: "var(--text-muted)", marginBottom: 18 }}>
          {body}
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          {secondary && (
            <button
              onClick={secondary.onClick}
              style={{
                background: "transparent",
                color: "var(--text-muted)",
                border: "1px solid var(--border)",
                borderRadius: 5,
                padding: "6px 14px",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >{secondary.label}</button>
          )}
          <button
            onClick={primary.onClick}
            style={{
              background: "var(--accent)",
              color: "#fff",
              border: "none",
              borderRadius: 5,
              padding: "6px 18px",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >{primary.label}</button>
        </div>
      </div>
    </div>
  );
}
