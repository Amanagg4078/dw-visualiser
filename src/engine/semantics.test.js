import { describe, test, expect } from "vitest";
import {
  dwAdd, dwSub, dwMul, dwDiv, dwConcat,
  dwEq, dwNeq, dwLt, dwGt, dwNeg,
  dwBool, dwNot,
  dwApplyBinOp,
  dwEntries, dwObjectFromEntries,
} from "./semantics.js";

describe("semantics (Phase 1 behaviour locked in)", () => {
  test("arithmetic", () => {
    expect(dwAdd(2, 3)).toBe(5);
    expect(dwSub(5, 2)).toBe(3);
    expect(dwMul(4, 3)).toBe(12);
    expect(dwDiv(10, 4)).toBe(2.5);
    expect(dwNeg(7)).toBe(-7);
  });

  test("concat coerces both sides to string", () => {
    expect(dwConcat("Hello ", "world")).toBe("Hello world");
    expect(dwConcat("count: ", 3)).toBe("count: 3");
  });

  test("equality is strict", () => {
    expect(dwEq(1, 1)).toBe(true);
    expect(dwEq(1, "1")).toBe(false);
    expect(dwNeq(1, 2)).toBe(true);
  });

  test("ordering", () => {
    expect(dwLt(1, 2)).toBe(true);
    expect(dwGt(2, 1)).toBe(true);
    expect(dwApplyBinOp("<=", 5, 5)).toBe(true);
    expect(dwApplyBinOp("<=", 5, 6)).toBe(true);
    expect(dwApplyBinOp("<=", 6, 5)).toBe(false);
    expect(dwApplyBinOp(">=", 5, 5)).toBe(true);
    expect(dwApplyBinOp(">=", 6, 5)).toBe(true);
    expect(dwApplyBinOp(">=", 5, 6)).toBe(false);
  });

  test("dwApplyBinOp dispatches by op string", () => {
    expect(dwApplyBinOp("+", 1, 2)).toBe(3);
    expect(dwApplyBinOp("++", "a", "b")).toBe("ab");
    expect(dwApplyBinOp("==", 1, 1)).toBe(true);
  });

  test("dwApplyBinOp throws on unknown op", () => {
    expect(() => dwApplyBinOp("%", 1, 2)).toThrow(/Unknown operator/);
  });

  test("dwBool mirrors JS truthiness (will tighten to strict-Boolean later)", () => {
    expect(dwBool(true)).toBe(true);
    expect(dwBool(false)).toBe(false);
    expect(dwBool(null)).toBe(false);
    expect(dwBool(0)).toBe(false);
    expect(dwBool("")).toBe(false);
    expect(dwBool("x")).toBe(true);
    expect(dwBool(1)).toBe(true);
  });

  test("dwNot inverts truthiness", () => {
    expect(dwNot(true)).toBe(false);
    expect(dwNot(false)).toBe(true);
    expect(dwNot(null)).toBe(true);
    expect(dwNot("x")).toBe(false);
  });

  test("dwConcat on objects preserves duplicate keys (DW Object semantics)", () => {
    const result = dwConcat({ a: 1, b: 2 }, { a: 3, b: 4 });
    // The dedup view sees the last value for each key (so existing
    // selector/stdlib paths keep working).
    expect(result).toEqual({ a: 3, b: 4 });
    // But the ordered pair list with duplicates is attached for the JSON
    // output serializer to use.
    expect(dwEntries(result)).toEqual([["a", 1], ["b", 2], ["a", 3], ["b", 4]]);
  });

  test("dwConcat on objects with no overlap returns a plain object (no DW_PAIRS overhead)", () => {
    const result = dwConcat({ a: 1 }, { b: 2 });
    expect(result).toEqual({ a: 1, b: 2 });
    // Same shape as Object.entries — no Symbol attached.
    expect(dwEntries(result)).toEqual([["a", 1], ["b", 2]]);
  });

  test("dwObjectFromEntries attaches DW_PAIRS only when duplicates exist", () => {
    const noDup = dwObjectFromEntries([["a", 1], ["b", 2]]);
    expect(dwEntries(noDup)).toEqual([["a", 1], ["b", 2]]);
    const withDup = dwObjectFromEntries([["a", 1], ["a", 2]]);
    expect(dwEntries(withDup)).toEqual([["a", 1], ["a", 2]]);
    expect(withDup).toEqual({ a: 2 });  // dedup view, last wins
  });

  // Documented JS-isms that real DataWeave handles differently.
  // These tests pin the current behaviour so the day we replace them
  // with DW-accurate semantics, the diff is loud and intentional.
  test("known JS-isms (will diverge from DW once semantics layer tightens)", () => {
    expect(dwDiv(1, 0)).toBe(Infinity);    // DW throws
    expect(dwAdd("5", 5)).toBe("55");      // DW: type error
    expect(dwAdd(null, 1)).toBe(1);        // DW: null-propagates
  });
});
