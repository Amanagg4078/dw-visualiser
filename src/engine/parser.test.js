import { describe, test, expect } from "vitest";
import { tokenize } from "./lexer.js";
import { parse } from "./parser.js";

const parseSrc = (src) => parse(tokenize(src));

describe("parser", () => {
  test("parses an empty script with header only", () => {
    const ast = parseSrc(`---\n1`);
    expect(ast.kind).toBe("Script");
    expect(ast.header.vars).toEqual([]);
    expect(ast.body).toEqual(expect.objectContaining({ kind: "NumLit", value: 1 }));
  });

  test("parses %dw directive and output mime", () => {
    const ast = parseSrc(`%dw 2.0\noutput application/json\n---\n1`);
    expect(ast.header.output).toBe("application/json");
  });

  test("parses var declarations in header", () => {
    const ast = parseSrc(`var x = 1\nvar y = 2\n---\nx + y`);
    expect(ast.header.vars.map((v) => v.name)).toEqual(["x", "y"]);
  });

  test("respects operator precedence: * binds tighter than +", () => {
    const ast = parseSrc(`---\n1 + 2 * 3`);
    expect(ast.body).toEqual(
      expect.objectContaining({
        kind: "BinOp",
        op: "+",
        left: expect.objectContaining({ kind: "NumLit", value: 1 }),
        right: expect.objectContaining({
          kind: "BinOp",
          op: "*",
          left: expect.objectContaining({ value: 2 }),
          right: expect.objectContaining({ value: 3 }),
        }),
      })
    );
  });

  test("parentheses override precedence", () => {
    const ast = parseSrc(`---\n(1 + 2) * 3`);
    expect(ast.body.op).toBe("*");
    expect(ast.body.left.op).toBe("+");
  });

  test("parses selectors as left-associative postfix chain", () => {
    const ast = parseSrc(`---\npayload.a.b`);
    expect(ast.body.kind).toBe("Selector");
    expect(ast.body.field).toBe("b");
    expect(ast.body.object.kind).toBe("Selector");
    expect(ast.body.object.field).toBe("a");
  });

  test("parses object and array literals", () => {
    const ast = parseSrc(`---\n{ items: [1, 2, 3], n: 4 }`);
    expect(ast.body.kind).toBe("ObjectLit");
    expect(ast.body.fields.map((f) => f.key)).toEqual(["items", "n"]);
    expect(ast.body.fields[0].value.kind).toBe("ArrayLit");
  });

  test("parses unary minus", () => {
    const ast = parseSrc(`---\n-5`);
    expect(ast.body).toEqual(
      expect.objectContaining({
        kind: "UnaryOp",
        op: "-",
        operand: expect.objectContaining({ value: 5 }),
      })
    );
  });

  test("throws on missing separator", () => {
    expect(() => parseSrc(`1 + 1`)).toThrow();
  });

  test("parses index selectors and chains them with field selectors", () => {
    const ast = parseSrc(`---\npayload.users[0].name`);
    // payload.users[0].name = Selector(IndexSelector(Selector(payload, users), 0), name)
    expect(ast.body.kind).toBe("Selector");
    expect(ast.body.field).toBe("name");
    expect(ast.body.object.kind).toBe("IndexSelector");
    expect(ast.body.object.index.kind).toBe("NumLit");
    expect(ast.body.object.index.value).toBe(0);
    expect(ast.body.object.object.kind).toBe("Selector");
    expect(ast.body.object.object.field).toBe("users");
  });

  test("parses range selector with contextual `to`", () => {
    const ast = parseSrc(`---\narr[0 to 2]`);
    expect(ast.body.kind).toBe("RangeSelector");
    expect(ast.body.start.value).toBe(0);
    expect(ast.body.end.value).toBe(2);
  });

  test("parses standalone range literal `(n to m)`", () => {
    const ast = parseSrc(`---\n(1 to 5)`);
    expect(ast.body.kind).toBe("RangeLit");
    expect(ast.body.start.value).toBe(1);
    expect(ast.body.end.value).toBe(5);
  });

  test("range literal accepts arbitrary endpoint expressions", () => {
    const ast = parseSrc(`---\n(payload.from to payload.to)`);
    expect(ast.body.kind).toBe("RangeLit");
    expect(ast.body.start.kind).toBe("Selector");
    expect(ast.body.end.kind).toBe("Selector");
  });

  test("parses multi-value selector `.*field`", () => {
    const ast = parseSrc(`---\npayload.*name`);
    expect(ast.body.kind).toBe("MultiValueSelector");
    expect(ast.body.field).toBe("name");
  });

  test("parses descendants selector `..field`", () => {
    const ast = parseSrc(`---\npayload..id`);
    expect(ast.body.kind).toBe("DescendantsSelector");
    expect(ast.body.field).toBe("id");
  });

  test("`to` outside brackets stays a regular identifier (so `var to = 5` works)", () => {
    const ast = parseSrc(`var to = 5\n---\nto`);
    expect(ast.header.vars[0].name).toBe("to");
    expect(ast.body.kind).toBe("Ident");
    expect(ast.body.name).toBe("to");
  });

  test("parses negative index selectors via unary minus", () => {
    const ast = parseSrc(`---\narr[-1]`);
    expect(ast.body.kind).toBe("IndexSelector");
    expect(ast.body.index.kind).toBe("UnaryOp");
    expect(ast.body.index.operand.value).toBe(1);
  });

  test("logical keywords (`and`/`or`/`not`) are valid field names after a dot", () => {
    // Regression: a payload field happens to be called `not`; the parser
    // must accept it as a Selector field, not try to parse it as the unary
    // operator.
    const ast = parseSrc(`---\npayload.does.not.exist`);
    expect(ast.body.kind).toBe("Selector");
    expect(ast.body.field).toBe("exist");
    expect(ast.body.object.field).toBe("not");
    expect(ast.body.object.object.field).toBe("does");
  });

  test("logical keywords are valid as bare object keys", () => {
    const ast = parseSrc(`---\n{ not: 1, and: 2, or: 3, var: 4 }`);
    expect(ast.body.kind).toBe("ObjectLit");
    expect(ast.body.fields.map((f) => f.key)).toEqual(["not", "and", "or", "var"]);
  });

  test("parses logical operators with `and` binding tighter than `or`", () => {
    const ast = parseSrc(`---\na or b and c`);
    // Should parse as: Or(a, And(b, c))
    expect(ast.body.kind).toBe("LogicalOp");
    expect(ast.body.op).toBe("or");
    expect(ast.body.left.kind).toBe("Ident");
    expect(ast.body.left.name).toBe("a");
    expect(ast.body.right.kind).toBe("LogicalOp");
    expect(ast.body.right.op).toBe("and");
  });

  test("parses `not` as a unary right-associative prefix", () => {
    const ast = parseSrc(`---\nnot not a`);
    expect(ast.body.kind).toBe("LogicalNot");
    expect(ast.body.operand.kind).toBe("LogicalNot");
    expect(ast.body.operand.operand.name).toBe("a");
  });

  test("not binds tighter than and/or", () => {
    const ast = parseSrc(`---\nnot a and b`);
    // (not a) and b
    expect(ast.body.kind).toBe("LogicalOp");
    expect(ast.body.op).toBe("and");
    expect(ast.body.left.kind).toBe("LogicalNot");
    expect(ast.body.right.name).toBe("b");
  });

  test("parses if/else as an expression", () => {
    const ast = parseSrc(`---\nif (a) 1 else 2`);
    expect(ast.body.kind).toBe("IfElse");
    expect(ast.body.cond.kind).toBe("Ident");
    expect(ast.body.then.value).toBe(1);
    expect(ast.body.else.value).toBe(2);
  });

  test("parses chained if / else if / else", () => {
    const ast = parseSrc(`---\nif (a) 1 else if (b) 2 else 3`);
    expect(ast.body.kind).toBe("IfElse");
    expect(ast.body.else.kind).toBe("IfElse");
    expect(ast.body.else.else.value).toBe(3);
  });

  test("parses `fun` declarations in the header", () => {
    const ast = parseSrc(`fun add(x, y) = x + y\n---\nadd(1, 2)`);
    expect(ast.header.vars).toHaveLength(1);
    expect(ast.header.vars[0].name).toBe("add");
    expect(ast.header.vars[0].expr.kind).toBe("Lambda");
    expect(ast.header.vars[0].expr.params).toEqual(["x", "y"]);
  });

  test("parses lambdas in expression position", () => {
    const ast = parseSrc(`---\n(x) -> x + 1`);
    expect(ast.body.kind).toBe("Lambda");
    expect(ast.body.params).toEqual(["x"]);
  });

  test("parses zero-arg lambdas `() -> expr`", () => {
    const ast = parseSrc(`---\n() -> 42`);
    expect(ast.body.kind).toBe("Lambda");
    expect(ast.body.params).toEqual([]);
  });

  test("still parses `(x)` as a parenthesised expression when no arrow follows", () => {
    const ast = parseSrc(`---\n(1 + 2) * 3`);
    expect(ast.body.kind).toBe("BinOp");
    expect(ast.body.op).toBe("*");
  });

  test("parses a literal-pattern match expression", () => {
    const ast = parseSrc(`---\npayload match { case 1 -> "one" case 2 -> "two" else -> "other" }`);
    expect(ast.body.kind).toBe("MatchExpr");
    expect(ast.body.cases).toHaveLength(2);
    expect(ast.body.cases[0].literal.value).toBe(1);
    expect(ast.body.cases[0].result.value).toBe("one");
    expect(ast.body.fallback.value).toBe("other");
  });

  test("match accepts `case ->` form for the fallback (no `else`)", () => {
    const ast = parseSrc(`---\npayload match { case 1 -> "one" case -> "fallback" }`);
    expect(ast.body.cases).toHaveLength(1);
    expect(ast.body.fallback.value).toBe("fallback");
  });

  test("parses infix function calls left-associatively", () => {
    // `a fn b fn c` → fn(fn(a, b), c)
    const ast = parseSrc(`---\na fn b fn c`);
    expect(ast.body.kind).toBe("Call");
    expect(ast.body.callee.name).toBe("fn");
    expect(ast.body.args[0].kind).toBe("Call");
    expect(ast.body.args[0].callee.name).toBe("fn");
    expect(ast.body.args[1].name).toBe("c");
  });

  test("auto-wraps `$` references in args to built-in HOFs (filter / map / …)", () => {
    const ast = parseSrc(`---\nfilter(arr, $ * 2)`);
    expect(ast.body.kind).toBe("Call");
    const arg = ast.body.args[1];
    expect(arg.kind).toBe("Lambda");
    expect(arg.params).toEqual(["$"]);
  });

  test("auto-wraps `$` and `$$` together, with the correct param count", () => {
    const ast = parseSrc(`---\nreduce(arr, $ + $$)`);
    const arg = ast.body.args[1];
    expect(arg.kind).toBe("Lambda");
    expect(arg.params).toEqual(["$", "$$"]);
  });

  test("does NOT auto-wrap `$` for user-defined callees (matches real DW)", () => {
    // Real DataWeave restricts `$` syntax to built-in HOFs only. For arbitrary
    // user functions it leaves `$` as a plain Ident, which will resolve at
    // runtime as an "Unknown identifier" error — same as the real runtime.
    const ast = parseSrc(`---\napplyTo(5, $ * 2)`);
    const arg = ast.body.args[1];
    expect(arg.kind).not.toBe("Lambda");
  });

  test("explicit lambdas are NOT auto-wrapped", () => {
    const ast = parseSrc(`---\napplyTo(5, (x) -> x + 1)`);
    const arg = ast.body.args[1];
    expect(arg.kind).toBe("Lambda");
    expect(arg.params).toEqual(["x"]); // not "$"
  });

  test("parses function calls in postfix position", () => {
    const ast = parseSrc(`---\nf(1, 2)`);
    expect(ast.body.kind).toBe("Call");
    expect(ast.body.callee.kind).toBe("Ident");
    expect(ast.body.callee.name).toBe("f");
    expect(ast.body.args.map((a) => a.value)).toEqual([1, 2]);
  });

  test("accepts header directives in any order", () => {
    const src = `%dw 2.0
var tax = 0.1
var subtotal = payload.price * payload.qty
output application/json
---
{ a: 1 }`;
    const ast = parseSrc(src);
    expect(ast.header.output).toBe("application/json");
    expect(ast.header.vars.map((v) => v.name)).toEqual(["tax", "subtotal"]);
  });
});
