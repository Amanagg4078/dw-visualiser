import { dwApplyBinOp, dwNeg, dwBool, dwNot } from "./semantics.js";

export function evaluate(script, payload) {
  const trace = [];
  let stepId = 0;
  const scopeChain = [{ payload }];

  const snap = () => Object.assign({}, ...scopeChain);
  const emit = (event) => {
    trace.push({ id: stepId++, ...event, scope: snap() });
  };

  for (const v of script.header.vars) {
    emit({
      phase: "var-start",
      description: `Begin evaluating var ${v.name}`,
      line: v.line,
      expr: exprToStr(v.expr),
    });
    const value = evalExpr(v.expr);
    scopeChain[0][v.name] = value;
    emit({
      phase: "var-done",
      description: `var ${v.name} = ${formatValue(value)}`,
      line: v.line,
      expr: exprToStr(v.expr),
      value,
    });
  }

  emit({
    phase: "body-start",
    description: "Begin evaluating output expression",
    line: script.body.line,
    expr: exprToStr(script.body),
  });
  const result = evalExpr(script.body);
  emit({
    phase: "body-done",
    description: "Output complete",
    line: script.body.line,
    expr: exprToStr(script.body),
    value: result,
  });

  return { result, trace };

  function evalExpr(node) {
    if (node.kind === "NumLit" || node.kind === "StrLit" || node.kind === "BoolLit") {
      emit({ phase: "literal", description: `Literal ${formatValue(node.value)}`, line: node.line, expr: formatValue(node.value), value: node.value });
      return node.value;
    }
    if (node.kind === "NullLit") {
      emit({ phase: "literal", description: `Literal null`, line: node.line, expr: "null", value: null });
      return null;
    }
    if (node.kind === "Ident") {
      const value = scopeChain[0][node.name];
      if (value === undefined) throw new Error(`Unknown identifier: ${node.name} at line ${node.line}`);
      emit({ phase: "lookup", description: `Look up \`${node.name}\``, line: node.line, expr: node.name, value });
      return value;
    }
    if (node.kind === "Selector") {
      const obj = evalExpr(node.object);
      if (obj == null) {
        emit({ phase: "selector", description: `Selector .${node.field} on null → null`, line: node.line, expr: exprToStr(node), value: null });
        return null;
      }
      // DW normalises a missing field to `null` (not `undefined`). Leaving
      // `undefined` here leaks into JsonView ("undefined") and gets *dropped*
      // by JSON.stringify, which silently disappears the field from the
      // copied output.
      const raw = obj[node.field];
      const value = raw === undefined ? null : raw;
      emit({ phase: "selector", description: `${exprToStr(node.object)}.${node.field}`, line: node.line, expr: exprToStr(node), value });
      return value;
    }
    if (node.kind === "RangeSelector") {
      const obj = evalExpr(node.object);
      const startV = evalExpr(node.start);
      const endV = evalExpr(node.end);
      let value = null;
      if (obj != null && (Array.isArray(obj) || typeof obj === "string")) {
        const len = obj.length;
        // Negative indices count from the end.
        const realStart = typeof startV === "number" && startV < 0 ? len + startV : startV;
        const realEnd   = typeof endV   === "number" && endV   < 0 ? len + endV   : endV;
        // DW range is inclusive on both ends. When start > end, the slice
        // is *reversed* (verified against the public DW runtime).
        const reverse = realStart > realEnd;
        const lo = Math.max(0, Math.min(len, Math.min(realStart, realEnd)));
        const hi = Math.max(0, Math.min(len, Math.max(realStart, realEnd) + 1));
        let slice = obj.slice(lo, hi);
        if (reverse) {
          if (Array.isArray(slice)) slice = slice.slice().reverse();
          else slice = [...slice].reverse().join("");
        }
        value = slice;
      }
      emit({
        phase: "range-selector",
        description: `${exprToStr(node.object)}[${formatValue(startV)} to ${formatValue(endV)}]`,
        line: node.line,
        expr: exprToStr(node),
        value,
      });
      return value;
    }
    if (node.kind === "MultiValueSelector") {
      const obj = evalExpr(node.object);
      // DW returns `null` (not `[]`) when there are no matches — verified
      // against the public DW runtime. We collect first, then fold empty → null.
      let matches = null;
      if (obj != null) {
        if (Array.isArray(obj)) {
          matches = obj
            .filter((x) => x != null && typeof x === "object" && !Array.isArray(x) && node.field in x)
            .map((x) => x[node.field]);
        } else if (typeof obj === "object") {
          matches = node.field in obj ? [obj[node.field]] : [];
        } else {
          matches = [];
        }
      }
      const value = matches && matches.length > 0 ? matches : null;
      emit({
        phase: "multi-value-selector",
        description: `${exprToStr(node.object)}.*${node.field}`,
        line: node.line,
        expr: exprToStr(node),
        value,
      });
      return value;
    }
    if (node.kind === "DescendantsSelector") {
      const obj = evalExpr(node.object);
      // Walk the structure recursively and collect every value at any
      // field equal to `node.field`. Order is depth-first, parents before children.
      const out = [];
      const walk = (v) => {
        if (v == null) return;
        if (Array.isArray(v)) {
          for (const item of v) walk(item);
        } else if (typeof v === "object") {
          for (const [k, vv] of Object.entries(v)) {
            if (k === node.field) out.push(vv);
            walk(vv);
          }
        }
      };
      walk(obj);
      // DW returns `null` for no matches (verified against the public runtime).
      const value = out.length > 0 ? out : null;
      emit({
        phase: "descendants-selector",
        description: `${exprToStr(node.object)}..${node.field}`,
        line: node.line,
        expr: exprToStr(node),
        value,
      });
      return value;
    }
    if (node.kind === "IndexSelector") {
      const obj = evalExpr(node.object);
      const idx = evalExpr(node.index);
      let value = null;
      if (obj != null) {
        if (Array.isArray(obj) || typeof obj === "string") {
          // DW: negative indices count from the end; out-of-bounds → null.
          const realIdx = typeof idx === "number" && idx < 0 ? obj.length + idx : idx;
          value = obj[realIdx];
          if (value === undefined) value = null;
        } else if (typeof obj === "object") {
          // DW: indexing an object returns the value at the n-th entry.
          const entries = Object.entries(obj);
          const realIdx = typeof idx === "number" && idx < 0 ? entries.length + idx : idx;
          value = entries[realIdx]?.[1] ?? null;
        }
      }
      emit({
        phase: "index-selector",
        description: `${exprToStr(node.object)}[${formatValue(idx)}]`,
        line: node.line,
        expr: exprToStr(node),
        value,
      });
      return value;
    }
    if (node.kind === "UnaryOp") {
      const v = evalExpr(node.operand);
      const result = node.op === "-" ? dwNeg(v) : v;
      emit({ phase: "unary", description: `${node.op}${formatValue(v)}`, line: node.line, expr: exprToStr(node), value: result });
      return result;
    }
    if (node.kind === "BinOp") {
      const l = evalExpr(node.left);
      const r = evalExpr(node.right);
      const result = dwApplyBinOp(node.op, l, r);
      emit({ phase: "binop", description: `${formatValue(l)} ${node.op} ${formatValue(r)}`, line: node.line, expr: exprToStr(node), value: result });
      return result;
    }
    if (node.kind === "LogicalOp") {
      // Short-circuit: don't evaluate the right side if the left already
      // determines the result. Tracer notes the skip so the lesson can show
      // *why* the right operand never runs.
      const l = evalExpr(node.left);
      const lBool = dwBool(l);
      if (node.op === "or" && lBool) {
        emit({ phase: "logical", description: `${formatValue(l)} or … (short-circuit: right side skipped)`, line: node.line, expr: exprToStr(node), value: true });
        return true;
      }
      if (node.op === "and" && !lBool) {
        emit({ phase: "logical", description: `${formatValue(l)} and … (short-circuit: right side skipped)`, line: node.line, expr: exprToStr(node), value: false });
        return false;
      }
      const r = evalExpr(node.right);
      const result = dwBool(r);
      emit({ phase: "logical", description: `${formatValue(l)} ${node.op} ${formatValue(r)}`, line: node.line, expr: exprToStr(node), value: result });
      return result;
    }
    if (node.kind === "LogicalNot") {
      const v = evalExpr(node.operand);
      const result = dwNot(v);
      emit({ phase: "logical", description: `not ${formatValue(v)}`, line: node.line, expr: exprToStr(node), value: result });
      return result;
    }
    if (node.kind === "ObjectLit") {
      const obj = {};
      emit({ phase: "object-start", description: `Begin building object`, line: node.line, expr: exprToStr(node) });
      for (const f of node.fields) {
        const val = evalExpr(f.value);
        obj[f.key] = val;
        emit({ phase: "object-field", description: `Set field "${f.key}" = ${formatValue(val)}`, line: f.line ?? node.line, expr: `${f.key}: ${exprToStr(f.value)}`, value: val });
      }
      emit({ phase: "object-done", description: `Object complete`, line: node.line, expr: exprToStr(node), value: obj });
      return obj;
    }
    if (node.kind === "ArrayLit") {
      const items = [];
      emit({ phase: "array-start", description: `Begin building array`, line: node.line, expr: exprToStr(node) });
      for (let i = 0; i < node.items.length; i++) {
        const itemNode = node.items[i].value;
        const v = evalExpr(itemNode);
        items.push(v);
        emit({ phase: "array-item", description: `Pushed [${i}] = ${formatValue(v)}`, line: node.items[i].line ?? node.line, expr: exprToStr(itemNode), value: v });
      }
      emit({ phase: "array-done", description: `Array complete`, line: node.line, expr: exprToStr(node), value: items });
      return items;
    }
    throw new Error(`Cannot evaluate node: ${node.kind}`);
  }
}

export function formatValue(v) {
  if (v === null || v === undefined) return "null";
  if (typeof v === "string") return JSON.stringify(v);
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export function exprToStr(node) {
  switch (node.kind) {
    case "NumLit": case "BoolLit": return String(node.value);
    case "StrLit": return JSON.stringify(node.value);
    case "NullLit": return "null";
    case "Ident": return node.name;
    case "Selector": return `${exprToStr(node.object)}.${node.field}`;
    case "IndexSelector": return `${exprToStr(node.object)}[${exprToStr(node.index)}]`;
    case "RangeSelector": return `${exprToStr(node.object)}[${exprToStr(node.start)} to ${exprToStr(node.end)}]`;
    case "MultiValueSelector": return `${exprToStr(node.object)}.*${node.field}`;
    case "DescendantsSelector": return `${exprToStr(node.object)}..${node.field}`;
    case "BinOp": return `(${exprToStr(node.left)} ${node.op} ${exprToStr(node.right)})`;
    case "LogicalOp": return `(${exprToStr(node.left)} ${node.op} ${exprToStr(node.right)})`;
    case "LogicalNot": return `not ${exprToStr(node.operand)}`;
    case "UnaryOp": return `${node.op}${exprToStr(node.operand)}`;
    case "ObjectLit": return `{${node.fields.map(f => `${f.key}: ${exprToStr(f.value)}`).join(", ")}}`;
    case "ArrayLit": return `[${node.items.map((it) => exprToStr(it.value)).join(", ")}]`;
    default: return "?";
  }
}
