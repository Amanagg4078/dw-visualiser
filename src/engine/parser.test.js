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
