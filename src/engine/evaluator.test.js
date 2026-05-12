import { describe, test, expect } from "vitest";
import { run } from "./index.js";

describe("evaluator end-to-end", () => {
  test("evaluates literals and arithmetic with correct precedence", () => {
    const { result } = run(`---\n1 + 2 * 3`, {});
    expect(result).toBe(7);
  });

  test("uses var bindings from the header", () => {
    const { result } = run(`var x = 10\nvar y = 2\n---\nx + y`, {});
    expect(result).toBe(12);
  });

  test("walks payload selectors", () => {
    const src = `---\npayload.user.name`;
    const { result } = run(src, { user: { name: "Aman" } });
    expect(result).toBe("Aman");
  });

  test("null-safe selector returns null without throwing", () => {
    const { result } = run(`---\npayload.missing.deep`, { missing: null });
    expect(result).toBe(null);
  });

  test("a missing field (not just a null one) returns null, not undefined", () => {
    // Regression: payload.user.middleName where `user` exists but `middleName`
    // doesn't — DW returns null. We used to leak JS `undefined`, which the
    // UI printed as "undefined" and `JSON.stringify` silently *dropped* from
    // the output.
    const { result } = run(`---\npayload.user.middleName`, { user: { name: "Alice" } });
    expect(result).toBe(null);
  });

  test("missing fields survive JSON.stringify (no silent key drop)", () => {
    const { result } = run(
      `---\n{ name: payload.user.name, missing: payload.user.middleName }`,
      { user: { name: "Alice" } }
    );
    expect(result).toEqual({ name: "Alice", missing: null });
    expect(JSON.stringify(result)).toBe('{"name":"Alice","missing":null}');
  });

  test("builds the receipt sample correctly", () => {
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
    const { result } = run(src, { name: "Coffee", price: 4.5, qty: 3 });
    expect(result).toEqual({
      item: "Coffee",
      subtotal: 13.5,
      tax: expect.closeTo(1.35, 5),
      total: expect.closeTo(14.85, 5),
      message: "Receipt for Coffee",
    });
  });

  test("emits a trace with var-done and body-done events", () => {
    const { trace } = run(`var x = 2 + 3\n---\nx * 2`, {});
    const varDone = trace.find((t) => t.phase === "var-done");
    expect(varDone?.value).toBe(5);
    const bodyDone = trace.find((t) => t.phase === "body-done");
    expect(bodyDone?.value).toBe(10);
  });

  test("trace events carry a source line and scope snapshot", () => {
    const { trace } = run(`var x = 1\n---\nx + 1`, {});
    for (const ev of trace) {
      expect(ev).toHaveProperty("line");
      expect(ev).toHaveProperty("scope");
    }
    const lookup = trace.find((t) => t.phase === "lookup" && t.expr === "x");
    expect(lookup?.scope).toMatchObject({ x: 1 });
  });

  test("throws on unknown identifier", () => {
    expect(() => run(`---\nnope`, {})).toThrow(/Unknown identifier/);
  });

  test("declared vars appear in scope only after their var-done event (Python-Tutor model)", () => {
    const { trace } = run(`var x = 1\nvar y = 2\n---\nx + y`, {});
    // First event (var-start for x): scope has payload only — x and y are not bound yet.
    expect(trace[0].scope).not.toHaveProperty("x");
    expect(trace[0].scope).not.toHaveProperty("y");
    // After x's var-done, x is in scope.
    const xDone = trace.findIndex((t) => t.phase === "var-done" && t.value === 1);
    expect(trace[xDone + 1].scope).toHaveProperty("x", 1);
    expect(trace[xDone + 1].scope).not.toHaveProperty("y");
    // By the time we look up x in the body, both are bound.
    const lookup = trace.find((t) => t.phase === "lookup" && t.expr === "x");
    expect(lookup?.scope).toMatchObject({ x: 1, y: 2 });
  });

  test("object-field events carry the field's own source line, not the {-line", () => {
    const src = `---\n{\n  a: 1,\n  b: 2\n}`;
    const { trace } = run(src, {});
    const fieldA = trace.find((t) => t.phase === "object-field" && t.description.includes('"a"'));
    const fieldB = trace.find((t) => t.phase === "object-field" && t.description.includes('"b"'));
    expect(fieldA?.line).toBe(3);
    expect(fieldB?.line).toBe(4);
  });

  test("index selector returns the element at the given position", () => {
    const { result } = run(`---\npayload.users[1]`, { users: ["a", "b", "c"] });
    expect(result).toBe("b");
  });

  test("negative index selector counts from the end", () => {
    const { result } = run(`---\npayload[-1]`, [10, 20, 30]);
    expect(result).toBe(30);
  });

  test("out-of-bounds index returns null (does not throw)", () => {
    const { result } = run(`---\npayload[99]`, [1, 2, 3]);
    expect(result).toBe(null);
  });

  test("index on null is null-safe", () => {
    const { result } = run(`---\npayload.missing[0]`, { missing: null });
    expect(result).toBe(null);
  });

  test("string indexing returns the n-th character", () => {
    const { result } = run(`---\npayload[1]`, "hello");
    expect(result).toBe("e");
  });

  test("object indexing returns the n-th entry's value", () => {
    const { result } = run(`---\npayload[1]`, { a: 1, b: 2, c: 3 });
    expect(result).toBe(2);
  });

  test("index-selector emits a trace event with the resolved value", () => {
    const { trace } = run(`---\npayload[0]`, [42]);
    const ev = trace.find((t) => t.phase === "index-selector");
    expect(ev?.value).toBe(42);
    expect(ev?.expr).toBe("payload[0]");
  });

  // ─── 3.3 Range Selector ──────────────────────────────────────────────
  test("range selector returns inclusive slice", () => {
    expect(run(`---\npayload[0 to 2]`, [10, 20, 30, 40, 50]).result).toEqual([10, 20, 30]);
  });
  test("range selector handles negative indices", () => {
    expect(run(`---\npayload[1 to -1]`, [10, 20, 30, 40]).result).toEqual([20, 30, 40]);
  });
  test("range selector reverses when start > end (matches DW runtime)", () => {
    expect(run(`---\npayload[3 to 1]`, [10, 20, 30, 40, 50, 60]).result).toEqual([40, 30, 20]);
  });
  test("range selector works on strings (forward and reversed)", () => {
    expect(run(`---\npayload[1 to 3]`, "hello").result).toBe("ell");
    expect(run(`---\npayload[3 to 0]`, "DataWeave").result).toBe("ataD");
  });

  // ─── 3.4 Multi-Value Selector ────────────────────────────────────────
  test("multi-value selector collects field from each element of an array", () => {
    const { result } = run(`---\npayload.users.*name`, {
      users: [{ name: "A" }, { name: "B" }, { name: "C" }],
    });
    expect(result).toEqual(["A", "B", "C"]);
  });
  test("multi-value selector on a single object returns a singleton array", () => {
    expect(run(`---\npayload.*name`, { name: "Alice" }).result).toEqual(["Alice"]);
  });  test("multi-value selector with no matches returns null (matches DW runtime)", () => {
    expect(run(`---\npayload.users.*missing`, { users: [{ a: 1 }, { a: 2 }] }).result).toBe(null);
    expect(run(`---\npayload.*nope`, { name: "Alice" }).result).toBe(null);
  });

  // ─── 3.5 Descendants Selector ────────────────────────────────────────
  test("descendants selector finds field at any depth", () => {
    const { result } = run(`---\npayload..id`, {
      id: 1,
      child: { id: 2, grandchild: { id: 3 } },
      items: [{ id: 4 }, { id: 5 }],
    });
    expect(result).toEqual([1, 2, 3, 4, 5]);
  });
  test("descendants selector returns null when field is absent (matches DW runtime)", () => {
    expect(run(`---\npayload..missing`, { a: 1, b: { c: 2 } }).result).toBe(null);
  });

  test("`<=` and `>=` work end-to-end", () => {
    expect(run(`---\npayload.age >= 18`, { age: 21 }).result).toBe(true);
    expect(run(`---\npayload.age >= 18`, { age: 18 }).result).toBe(true);
    expect(run(`---\npayload.age >= 18`, { age: 17 }).result).toBe(false);
    expect(run(`---\npayload.age <= 18`, { age: 18 }).result).toBe(true);
    expect(run(`---\npayload.age <= 18`, { age: 19 }).result).toBe(false);
  });

  test("logical and / or / not produce booleans", () => {
    expect(run(`---\ntrue and false`, {}).result).toBe(false);
    expect(run(`---\ntrue and true`, {}).result).toBe(true);
    expect(run(`---\nfalse or true`, {}).result).toBe(true);
    expect(run(`---\nfalse or false`, {}).result).toBe(false);
    expect(run(`---\nnot true`, {}).result).toBe(false);
    expect(run(`---\nnot false`, {}).result).toBe(true);
  });

  test("logical operators short-circuit and emit a skip note", () => {
    // `or` with truthy left should not evaluate the right.
    const { trace, result } = run(`---\ntrue or payload.exploded`, {});
    expect(result).toBe(true);
    const evt = trace.find((t) => t.phase === "logical");
    expect(evt?.description).toMatch(/short-circuit/);
  });

  test("logical operators chain with the right precedence (and tighter than or)", () => {
    // true or false and false  →  true or (false and false)  →  true or false  →  true
    expect(run(`---\ntrue or false and false`, {}).result).toBe(true);
    // (true or false) and false would be `false`; the precedence test above proves we're not doing that.
  });

  test("array-item events carry the item's own source line", () => {
    // Line 1: `---`, line 2: `[`, line 3: `  1,`, line 4: `  2`, line 5: `]`
    const src = `---\n[\n  1,\n  2\n]`;
    const { trace } = run(src, {});
    const items = trace.filter((t) => t.phase === "array-item");
    expect(items.map((t) => t.line)).toEqual([3, 4]);
  });
});
