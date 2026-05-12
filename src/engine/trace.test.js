import { describe, test, expect } from "vitest";
import { buildLineSteps, lineIndexForStep } from "./trace.js";
import { run } from "./index.js";

describe("buildLineSteps", () => {
  test("returns empty for empty trace", () => {
    expect(buildLineSteps([])).toEqual([]);
    expect(buildLineSteps(undefined)).toEqual([]);
  });

  test("collapses consecutive same-line events into one step (anchored on the last)", () => {
    const trace = [
      { line: 3 }, { line: 3 }, { line: 3 },   // 0,1,2 — collapses to step pointing at 2
      { line: 4 }, { line: 4 },                // 3,4   — collapses to step pointing at 4
      { line: 6 },                              // 5     — step at 5
    ];
    expect(buildLineSteps(trace)).toEqual([
      { traceIndex: 2, line: 3 },
      { traceIndex: 4, line: 4 },
      { traceIndex: 5, line: 6 },
    ]);
  });

  test("treats interleaved lines as separate steps (no global dedupe)", () => {
    const trace = [
      { line: 7 }, { line: 7 },
      { line: 6 },                 // back to enclosing object literal line
      { line: 8 }, { line: 8 },
      { line: 6 },                 // back again
    ];
    expect(buildLineSteps(trace)).toEqual([
      { traceIndex: 1, line: 7 },
      { traceIndex: 2, line: 6 },
      { traceIndex: 4, line: 8 },
      { traceIndex: 5, line: 6 },
    ]);
  });

  test("end-to-end: receipt sample produces one step per source line", () => {
    const src = `%dw 2.0
output application/json
var tax = 0.1
var subtotal = payload.price * payload.qty
---
{
  item: payload.name,
  subtotal: subtotal,
  tax: subtotal * tax,
  total: subtotal + (subtotal * tax),
  message: "Receipt for " ++ payload.name
}`;
    const { trace } = run(src, { name: "Coffee", price: 4.5, qty: 3 });
    const lines = buildLineSteps(trace).map((s) => s.line);
    // Each declared/active source line should appear at least once.
    // Order matters: header vars first, then body building.
    expect(lines).toContain(3); // var tax
    expect(lines).toContain(4); // var subtotal
    expect(lines).toContain(7); // item field
    expect(lines).toContain(8); // subtotal field
    // The list should be MUCH shorter than the raw trace.
    expect(lines.length).toBeLessThan(trace.length / 2);
  });
});

describe("lineIndexForStep", () => {
  const lineSteps = [
    { traceIndex: 2, line: 3 },
    { traceIndex: 5, line: 4 },
    { traceIndex: 9, line: 6 },
  ];
  test("returns 0 when trace step is at or before the first line", () => {
    expect(lineIndexForStep(lineSteps, 0)).toBe(0);
    expect(lineIndexForStep(lineSteps, 2)).toBe(0);
  });
  test("returns the largest line index whose traceIndex <= step", () => {
    expect(lineIndexForStep(lineSteps, 4)).toBe(0);
    expect(lineIndexForStep(lineSteps, 5)).toBe(1);
    expect(lineIndexForStep(lineSteps, 7)).toBe(1);
    expect(lineIndexForStep(lineSteps, 9)).toBe(2);
    expect(lineIndexForStep(lineSteps, 99)).toBe(2);
  });
  test("returns 0 for empty input", () => {
    expect(lineIndexForStep([], 5)).toBe(0);
  });
});
