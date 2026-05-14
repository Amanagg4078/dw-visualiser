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

  // ─── Standalone (n to m) range literal ───────────────────────────────
  test("range literal `(1 to 5)` produces inclusive ascending array", () => {
    expect(run(`---\n(1 to 5)`).result).toEqual([1, 2, 3, 4, 5]);
  });
  test("range literal reverses when start > end", () => {
    expect(run(`---\n(5 to 1)`).result).toEqual([5, 4, 3, 2, 1]);
  });
  test("range literal single point produces a singleton array", () => {
    expect(run(`---\n(3 to 3)`).result).toEqual([3]);
  });
  test("range literal endpoints can be arbitrary expressions", () => {
    expect(run(`---\n(payload.lo to payload.hi)`, { lo: 2, hi: 4 }).result).toEqual([2, 3, 4]);
  });
  test("range literal emits a range-lit trace event", () => {
    const { trace } = run(`---\n(1 to 3)`);
    const e = trace.find((t) => t.phase === "range-lit");
    expect(e).toBeTruthy();
    expect(e.value).toEqual([1, 2, 3]);
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

  // ─── 5.2 Literal Pattern Matching ────────────────────────────────────
  test("match returns the first matching case's result", () => {
    const src = `---\npayload.action match {
      case "buy"  -> "Buy"
      case "sell" -> "Sell"
      else        -> "Other"
    }`;
    expect(run(src, { action: "buy" }).result).toBe("Buy");
    expect(run(src, { action: "sell" }).result).toBe("Sell");
    expect(run(src, { action: "hold" }).result).toBe("Other");
  });
  test("match matches across types (number, bool, string)", () => {
    const src = `---\npayload match {
      case 1     -> "Number one"
      case "hi"  -> "Greeting"
      case true  -> "Yes"
      else       -> "?"
    }`;
    expect(run(src, 1).result).toBe("Number one");
    expect(run(src, "hi").result).toBe("Greeting");
    expect(run(src, true).result).toBe("Yes");
    expect(run(src, 99).result).toBe("?");
  });
  test("match `case -> …` (no literal) acts as a fallback like `else`", () => {
    const src = `---\npayload match { case "x" -> "X" case -> "default" }`;
    expect(run(src, "y").result).toBe("default");
  });
  test("match with no fallback and no matching case returns null", () => {
    const src = `---\npayload match { case 1 -> "one" }`;
    expect(run(src, 99).result).toBe(null);
  });

  // ─── 6.4 Infix notation ──────────────────────────────────────────────
  test("infix call: `a fn b` is the same as `fn(a, b)`", () => {
    const src = `fun add(a, b) = a + b\n---\n{ prefix: add(2, 3), infix: 2 add 3 }`;
    const { result } = run(src, {});
    expect(result).toEqual({ prefix: 5, infix: 5 });
  });
  test("infix chains left-associatively", () => {
    // `10 applyTo ((x) -> x + 1) applyTo ((x) -> x * 2)` = ((10+1)*2) = 22
    const src = `fun applyTo(arg, f) = f(arg)\n---\n10 applyTo ((x) -> x + 1) applyTo ((x) -> x * 2)`;
    expect(run(src, {}).result).toBe(22);
  });

  // ─── 6.5 $ / $$ / $$$ implicit params ────────────────────────────────
  // Real DataWeave only enables the dollar-sign sugar for *built-in* HOFs,
  // not user-defined ones. Our parser whitelists `filter` / `map` / `reduce`
  // / `filterObject` / `mapObject` / etc. — any other callee leaves `$` as
  // an unresolved identifier (same behaviour as the real runtime).
  test("`$` inside a `filter` arg auto-wraps as a one-param lambda", () => {
    expect(run(`---\npayload filter ($ > 3)`, [1, 2, 3, 4, 5]).result).toEqual([4, 5]);
  });
  test("`$.field` works inside filter (selector on implicit param)", () => {
    const { result } = run(
      `---\npayload filter ($.role == "admin")`,
      [{ name: "A", role: "admin" }, { name: "B", role: "user" }, { name: "C", role: "admin" }]
    );
    expect(result).toEqual([{ name: "A", role: "admin" }, { name: "C", role: "admin" }]);
  });
  test("`$` is NOT auto-wrapped for user-defined callees (matches real DW)", () => {
    // Real DW: "Unable to resolve reference of: `$`."
    const src = `fun applyTo(arg, f) = f(arg)\n---\n10 applyTo ($ * 2)`;
    expect(() => run(src, {})).toThrow(/Unknown identifier: \$/);
  });

  // ─── 7.1 filter (first built-in) ─────────────────────────────────────
  test("filter built-in: prefix call with explicit lambda", () => {
    const src = `---\nfilter(payload, (n, idx) -> n > 2)`;
    expect(run(src, [1, 2, 3, 4]).result).toEqual([3, 4]);
  });
  test("filter built-in: infix call", () => {
    expect(run(`---\npayload filter ((n, idx) -> n > 2)`, [1, 2, 3, 4]).result).toEqual([3, 4]);
  });
  test("filter on null returns null", () => {
    expect(run(`---\npayload filter ($ > 0)`, null).result).toBe(null);
  });

  // ─── 7.2 map ─────────────────────────────────────────────────────────
  test("map applies the lambda to every element", () => {
    expect(run(`---\npayload map ($ * 2)`, [1, 2, 3]).result).toEqual([2, 4, 6]);
  });
  test("map exposes the index as the second lambda param", () => {
    const { result } = run(`---\npayload map ((n, idx) -> { i: idx, v: n })`, ["a", "b"]);
    expect(result).toEqual([{ i: 0, v: "a" }, { i: 1, v: "b" }]);
  });

  // ─── 7.3 distinctBy ──────────────────────────────────────────────────
  test("distinctBy on primitives — `distinctBy $` returns each unique item once", () => {
    expect(run(`---\npayload distinctBy $`, [1, 2, 3, 2, 1]).result).toEqual([1, 2, 3]);
  });
  test("distinctBy by object field keeps the first occurrence", () => {
    const { result } = run(
      `---\npayload distinctBy $.id`,
      [{ id: "A", v: 1 }, { id: "B", v: 2 }, { id: "A", v: 99 }]
    );
    expect(result).toEqual([{ id: "A", v: 1 }, { id: "B", v: 2 }]);
  });

  // ─── 7.4 groupBy ─────────────────────────────────────────────────────
  test("groupBy returns an object keyed by the lambda result", () => {
    const { result } = run(`---\npayload groupBy $.k`, [{ k: "x", v: 1 }, { k: "y", v: 2 }, { k: "x", v: 3 }]);
    expect(result).toEqual({ x: [{ k: "x", v: 1 }, { k: "x", v: 3 }], y: [{ k: "y", v: 2 }] });
  });
  test("groupBy with boolean keys coerces to `\"true\"` / `\"false\"`", () => {
    const { result } = run(`---\npayload groupBy ($ > 2)`, [1, 2, 3, 4]);
    expect(result).toEqual({ false: [1, 2], true: [3, 4] });
  });

  // ─── 7.5 reduce ──────────────────────────────────────────────────────
  test("reduce without an accumulator default seeds from arr[0] and iterates from idx 1", () => {
    expect(run(`---\npayload reduce ((n, t) -> t + n)`, [1, 2, 3, 4, 5]).result).toBe(15);
  });
  test("reduce with an accumulator default iterates over all items", () => {
    expect(run(`---\npayload reduce ((n, t = 1000) -> t + n)`, [1, 2, 3, 4, 5]).result).toBe(1015);
  });
  test("reduce can build any type — including the running max", () => {
    expect(run(`---\npayload reduce ((n, m) -> if (n > m) n else m)`, [3, 1, 7, 5]).result).toBe(7);
  });
  test("reduce on an empty array with no default returns null", () => {
    expect(run(`---\npayload reduce ((n, t) -> t + n)`, []).result).toBe(null);
  });

  // ─── 8.1 filterObject ────────────────────────────────────────────────
  test("filterObject keeps entries where the lambda returns truthy", () => {
    const { result } = run(`---\npayload filterObject ((v, k, idx) -> v > 10)`, { a: 5, b: 20, c: 30 });
    expect(result).toEqual({ b: 20, c: 30 });
  });
  test("filterObject lambda receives (value, key, index)", () => {
    const { result } = run(`---\npayload filterObject ((v, k, idx) -> idx >= 1)`, { a: 1, b: 2, c: 3 });
    expect(result).toEqual({ b: 2, c: 3 });
  });

  // ─── 8.2 mapObject + dynamic keys ────────────────────────────────────
  test("mapObject + dynamic keys rename every key", () => {
    const { result } = run(`---\npayload mapObject ((v, k, idx) -> { (upper(k)): v })`, { a: 1, b: 2 });
    expect(result).toEqual({ A: 1, B: 2 });
  });
  test("mapObject can transform values while keeping keys", () => {
    const { result } = run(`---\npayload mapObject ((v, k, idx) -> { (k): v * 10 })`, { a: 1, b: 2 });
    expect(result).toEqual({ a: 10, b: 20 });
  });

  // ─── 8.3 pluck ───────────────────────────────────────────────────────
  test("pluck → array of values", () => {
    expect(run(`---\npayload pluck ((v, k, idx) -> v)`, { a: 1, b: 2, c: 3 }).result).toEqual([1, 2, 3]);
  });
  test("pluck → array of single-pair objects (canonical)", () => {
    expect(run(`---\npayload pluck ((v, k, idx) -> { (k): v })`, { a: 1, b: 2 }).result)
      .toEqual([{ a: 1 }, { b: 2 }]);
  });

  // ─── 8.4 update ──────────────────────────────────────────────────────
  test("update with a single case replaces just that field", () => {
    const { result } = run(`---\npayload update { case n at .age -> n + 1 }`, { name: "A", age: 10 });
    expect(result).toEqual({ name: "A", age: 11 });
  });
  test("update applies multiple cases in order", () => {
    const src = `---\npayload update {
      case n at .firstName -> upper(n)
      case a at .age -> a * 2
    }`;
    expect(run(src, { firstName: "abc", age: 5 }).result).toEqual({ firstName: "ABC", age: 10 });
  });
  test("update does not mutate the original payload", () => {
    const orig = { age: 10 };
    run(`---\npayload update { case n at .age -> n + 1 }`, orig);
    expect(orig.age).toBe(10);
  });

  // ─── helpers (upper, lower, sizeOf) ──────────────────────────────────
  test("upper / lower / sizeOf built-ins", () => {
    expect(run(`---\nupper("hello")`, {}).result).toBe("HELLO");
    expect(run(`---\nlower("HELLO")`, {}).result).toBe("hello");
    expect(run(`---\nsizeOf([1,2,3])`, {}).result).toBe(3);
    expect(run(`---\nsizeOf("hello")`, {}).result).toBe(5);
    expect(run(`---\nsizeOf({ a: 1, b: 2 })`, {}).result).toBe(2);
  });

  // ─── 5.1 If / Else ───────────────────────────────────────────────────
  test("if/else returns the then-branch when condition is truthy", () => {
    expect(run(`---\nif (true) "yes" else "no"`, {}).result).toBe("yes");
    expect(run(`---\nif (1 < 2) "yes" else "no"`, {}).result).toBe("yes");
  });
  test("if/else returns the else-branch when condition is falsy", () => {
    expect(run(`---\nif (false) "yes" else "no"`, {}).result).toBe("no");
  });
  test("if/else only evaluates the taken branch (lazy)", () => {
    // The unused branch would blow up with a missing-identifier error if it
    // were evaluated. So a passing run here proves laziness.
    expect(run(`---\nif (true) 1 else nope`, {}).result).toBe(1);
    expect(run(`---\nif (false) nope else 2`, {}).result).toBe(2);
  });
  test("chained if/else works as expected", () => {
    const src = `---\nif (payload.x > 10) "big" else if (payload.x > 0) "small" else "non-positive"`;
    expect(run(src, { x: 100 }).result).toBe("big");
    expect(run(src, { x: 5 }).result).toBe("small");
    expect(run(src, { x: 0 }).result).toBe("non-positive");
  });

  // ─── 6.1 Named functions ─────────────────────────────────────────────
  test("named function declared in header is callable from the body", () => {
    const src = `fun add(x, y) = x + y\n---\nadd(2, 3)`;
    expect(run(src, {}).result).toBe(5);
  });
  test("named functions support recursion", () => {
    const src = `fun fact(n) = if (n <= 1) 1 else n * fact(n - 1)\n---\nfact(5)`;
    expect(run(src, {}).result).toBe(120);
  });

  // ─── 6.2 Lambdas + closures ──────────────────────────────────────────
  test("lambdas can be assigned to a var and called", () => {
    const src = `var inc = (x) -> x + 1\n---\ninc(41)`;
    expect(run(src, {}).result).toBe(42);
  });
  test("lambdas capture surrounding scope (closures)", () => {
    // `inc` captures `n` from the outer scope; calling it later still sees it.
    const src = `var n = 10\nvar inc = (x) -> x + n\n---\ninc(5)`;
    expect(run(src, {}).result).toBe(15);
  });
  test("zero-arg lambda", () => {
    const src = `var greet = () -> "Hello"\n---\ngreet()`;
    expect(run(src, {}).result).toBe("Hello");
  });

  // ─── 6.3 Functions as values ─────────────────────────────────────────
  test("functions are first-class values (can be passed via vars)", () => {
    const src = `var inc = (x) -> x + 1\nvar twice = (f, x) -> f(f(x))\n---\ntwice(inc, 10)`;
    expect(run(src, {}).result).toBe(12);
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
