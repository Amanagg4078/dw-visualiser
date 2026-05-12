import { describe, test, expect } from "vitest";
import { tokenize, TOK } from "./lexer.js";

const types = (tokens) => tokens.map((t) => t.type);

describe("lexer", () => {
  test("emits EOF on empty input", () => {
    const toks = tokenize("");
    expect(types(toks)).toEqual([TOK.EOF]);
  });

  test("tokenises a minimal script", () => {
    const toks = tokenize(`%dw 2.0\noutput application/json\n---\n1 + 2`);
    expect(types(toks)).toEqual([
      TOK.DW_DIRECTIVE,
      TOK.OUTPUT,
      TOK.IDENT, TOK.SLASH, TOK.IDENT, // application / json
      TOK.SEPARATOR,
      TOK.NUM, TOK.PLUS, TOK.NUM,
      TOK.EOF,
    ]);
  });

  test("distinguishes ++ from + and == from =", () => {
    const toks = tokenize(`a ++ b == c = d`);
    expect(types(toks)).toEqual([
      TOK.IDENT, TOK.CONCAT, TOK.IDENT,
      TOK.EQ, TOK.IDENT,
      TOK.ASSIGN, TOK.IDENT,
      TOK.EOF,
    ]);
  });

  test("parses numbers, booleans, null, strings", () => {
    const toks = tokenize(`1.5 true false null "hi"`);
    expect(toks.slice(0, -1)).toEqual([
      expect.objectContaining({ type: TOK.NUM, value: 1.5 }),
      expect.objectContaining({ type: TOK.BOOL, value: true }),
      expect.objectContaining({ type: TOK.BOOL, value: false }),
      expect.objectContaining({ type: TOK.NULL, value: null }),
      expect.objectContaining({ type: TOK.STR, value: "hi" }),
    ]);
  });

  test("skips // comments", () => {
    const toks = tokenize(`1 // a comment\n+ 2`);
    expect(types(toks)).toEqual([TOK.NUM, TOK.PLUS, TOK.NUM, TOK.EOF]);
  });

  test("tracks line numbers", () => {
    const toks = tokenize(`1\n2\n3`);
    expect(toks.map((t) => t.line)).toEqual([1, 2, 3, 3]);
  });

  test("throws on unexpected character", () => {
    expect(() => tokenize("@")).toThrow(/Unexpected character/);
  });

  test("recognises and / or / not as keyword tokens, not identifiers", () => {
    const toks = tokenize("a and b or not c");
    expect(types(toks)).toEqual([
      TOK.IDENT, TOK.AND, TOK.IDENT, TOK.OR, TOK.NOT, TOK.IDENT, TOK.EOF,
    ]);
  });

  test("emits DOT_STAR (`.*`) and DOT_DOT (`..`) as multi-char tokens", () => {
    const toks = tokenize("a..b.*c");
    expect(types(toks)).toEqual([
      TOK.IDENT, TOK.DOT_DOT, TOK.IDENT, TOK.DOT_STAR, TOK.IDENT, TOK.EOF,
    ]);
  });

  test("number lexer doesn't greedy-eat `.*` / `..` that follow a digit", () => {
    // Regression: previously `0..1` lexed as a single NaN-shaped number.
    const toks = tokenize("0..x");
    expect(types(toks)).toEqual([TOK.NUM, TOK.DOT_DOT, TOK.IDENT, TOK.EOF]);
    expect(toks[0].value).toBe(0);
  });

  test("decimal numbers still parse correctly", () => {
    const toks = tokenize("1.5 0.25");
    expect(toks.slice(0, -1).map((t) => t.value)).toEqual([1.5, 0.25]);
  });

  test("recognises <= and >= as multi-char comparison tokens", () => {
    const toks = tokenize("a <= b >= c < d > e");
    expect(types(toks)).toEqual([
      TOK.IDENT, TOK.LTE, TOK.IDENT, TOK.GTE, TOK.IDENT,
      TOK.LT,    TOK.IDENT, TOK.GT,    TOK.IDENT, TOK.EOF,
    ]);
  });
});
