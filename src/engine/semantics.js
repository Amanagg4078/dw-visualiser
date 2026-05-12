// DataWeave semantic wrappers for unary and binary operators.
//
// These currently mirror raw JS behaviour to preserve Phase 1 semantics
// while the engine is being modularised. Each function names the known
// divergence from real DataWeave so it can be tightened one op at a time
// (see kt.txt §6 "Semantic divergence from real DataWeave").
//
// Rule: evaluator.js MUST go through these wrappers — never use raw JS
// operators directly. That is the whole point of this module.

// DW: "5" + 5 is a type error (operands must match). JS coerces to "55".
export const dwAdd = (l, r) => l + r;

export const dwSub = (l, r) => l - r;
export const dwMul = (l, r) => l * r;

// DW: divide-by-zero throws; numbers are arbitrary-precision (BigDecimal).
// JS: 1/0 === Infinity; numbers are IEEE 754.
export const dwDiv = (l, r) => l / r;

// DW concat operator. Stringifies both sides.
export const dwConcat = (l, r) => String(l) + String(r);

// DW equality is strict and typed; JS === matches for primitives but
// will diverge for objects/arrays (reference vs structural equality).
export const dwEq = (l, r) => l === r;
export const dwNeq = (l, r) => l !== r;

export const dwLt  = (l, r) => l <  r;
export const dwGt  = (l, r) => l >  r;
export const dwLte = (l, r) => l <= r;
export const dwGte = (l, r) => l >= r;

export const dwNeg = (v) => -v;

// DW truthiness: in real DataWeave, `and`/`or`/`not` operate on Boolean only —
// passing a non-boolean is a type error. We mirror JS truthiness for now so
// learners can experiment freely, with a TODO to enforce strict booleans
// when we tighten semantics. Note any divergence here will surface in
// flow-control lessons (chapter 5) too.
export const dwBool = (v) => Boolean(v);
export const dwNot = (v) => !dwBool(v);

export function dwApplyBinOp(op, l, r) {
  switch (op) {
    case "+":  return dwAdd(l, r);
    case "-":  return dwSub(l, r);
    case "*":  return dwMul(l, r);
    case "/":  return dwDiv(l, r);
    case "++": return dwConcat(l, r);
    case "==": return dwEq(l, r);
    case "!=": return dwNeq(l, r);
    case "<":  return dwLt(l, r);
    case ">":  return dwGt(l, r);
    case "<=": return dwLte(l, r);
    case ">=": return dwGte(l, r);
    default: throw new Error(`Unknown operator ${op}`);
  }
}
