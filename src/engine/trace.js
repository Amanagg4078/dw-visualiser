// Line-level stepping support: collapse consecutive same-line trace events
// into a single "line step" anchored on the LAST event for that line. The
// resulting list lets the UI step source-line by source-line (Python-Tutor
// style) instead of AST-node by AST-node.
//
// Returned shape: [{ traceIndex, line }, ...]
//
// `traceIndex` points into the original `trace` array — pick that event when
// the user is on this line-step (its scope/value/description reflect the
// completed line).
export function buildLineSteps(trace) {
  const steps = [];
  if (!trace || trace.length === 0) return steps;
  for (let i = 0; i < trace.length; i++) {
    const ev = trace[i];
    const next = trace[i + 1];
    if (!next || next.line !== ev.line) {
      steps.push({ traceIndex: i, line: ev.line });
    }
  }
  return steps;
}

// Find the line-step index whose traceIndex is <= the given trace step.
// Used to map an event-level cursor onto a line-level one when switching modes.
export function lineIndexForStep(lineSteps, traceStep) {
  if (!lineSteps.length) return 0;
  let lo = 0, hi = lineSteps.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (lineSteps[mid].traceIndex <= traceStep) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}
