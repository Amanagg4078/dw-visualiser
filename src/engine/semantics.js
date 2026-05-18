// DataWeave semantic wrappers for unary and binary operators.
//
// These currently mirror raw JS behaviour to preserve Phase 1 semantics
// while the engine is being modularised. Each function names the known
// divergence from real DataWeave so it can be tightened one op at a time
// (see kt.txt §6 "Semantic divergence from real DataWeave").
//
// Rule: evaluator.js MUST go through these wrappers — never use raw JS
// operators directly. That is the whole point of this module.

// Real DataWeave Objects are *ordered* key/value lists that ALLOW
// duplicate keys (e.g. `{a: 1, a: 2} ++ {a: 3}` is `{a: 1, a: 2, a: 3}`,
// not `{a: 3}`). JS objects can't natively have duplicates, so we keep
// the deduplicated "last wins" view as the live JS object AND, when
// duplicates exist, attach the original ordered pair list under this
// Symbol. Downstream serialisation (JSON output, JsonView) reads the
// pair list so the user sees the real DW output verbatim.
//
// Note: `.field` selectors still resolve against the deduplicated view
// (so they return the last value, not the first). That's a documented
// divergence from real DW — fixing it requires updating every code path
// that touches objects, which we'll do incrementally.
export const DW_PAIRS = Symbol("__dwPairs");

// Return the ordered (k, v) pairs for a DW object. Uses the attached
// DW_PAIRS list if present (preserves duplicates), else falls back to
// Object.entries (no duplicates).
export function dwEntries(obj) {
  if (obj == null || typeof obj !== "object" || Array.isArray(obj)) return [];
  return obj[DW_PAIRS] ?? Object.entries(obj);
}

// Build a "DW object" from an ordered pair list. Returns a plain JS
// object (last value wins for the live view) with the original pair list
// attached as DW_PAIRS *only if* duplicates exist — otherwise it's an
// ordinary object indistinguishable from a JS literal.
export function dwObjectFromEntries(entries) {
  const out = {};
  const seen = new Set();
  let hasDup = false;
  for (const [k, v] of entries) {
    if (seen.has(k)) hasDup = true;
    else seen.add(k);
    out[k] = v;
  }
  if (hasDup) {
    Object.defineProperty(out, DW_PAIRS, { value: entries, enumerable: false });
  }
  return out;
}

// DW: "5" + 5 is a type error (operands must match). JS coerces to "55".
export const dwAdd = (l, r) => l + r;

export const dwSub = (l, r) => l - r;
export const dwMul = (l, r) => l * r;

// DW: divide-by-zero throws; numbers are arbitrary-precision (BigDecimal).
// JS: 1/0 === Infinity; numbers are IEEE 754.
export const dwDiv = (l, r) => l / r;

// DW concat operator. Overloaded:
//  - String + anything  → string concat (with stringification)
//  - Object + Object    → ordered append; DUPLICATE KEYS ARE PRESERVED
//                         (real DW Objects are ordered pair lists, not Maps)
//  - Array  + Array     → concatenation
// For mixed types we fall back to the string form (matches what real DW
// does when one side is a String).
export const dwConcat = (l, r) => {
  if (Array.isArray(l) && Array.isArray(r)) return [...l, ...r];
  const lIsObj = l && typeof l === "object" && !Array.isArray(l) && l.__closure !== true;
  const rIsObj = r && typeof r === "object" && !Array.isArray(r) && r.__closure !== true;
  if (lIsObj && rIsObj) {
    return dwObjectFromEntries([...dwEntries(l), ...dwEntries(r)]);
  }
  return String(l) + String(r);
};

// DW Object minus — real DW only supports `Object - String` (drop one key)
// or `Object - Name` (a single key reference). Array/Object RHS forms are
// rejected by the real runtime, so we reject them too. Returns a *new*
// object (input not mutated). Operates on the ordered pair list, so it
// drops *every* duplicate of the named key (matches real DW).
export const dwObjectMinus = (l, r) => {
  if (l == null || typeof l !== "object" || Array.isArray(l)) return l;
  if (typeof r !== "string") {
    throw new Error(`Object '-' expects a String key on the right, got ${typeof r}`);
  }
  return dwObjectFromEntries(dwEntries(l).filter(([k]) => k !== r));
};

// DW equality is strict and typed; JS === matches for primitives but
// will diverge for objects/arrays (reference vs structural equality).
export const dwEq = (l, r) => l === r;
export const dwNeq = (l, r) => l !== r;

// DW "similar to" — coerces both sides to the same loose representation
// before comparing. The tutorial recommends `~=` for `key == "name"` in
// filterObject lambdas, where `key` is internally type `Key` and `"name"`
// is `String`. We don't have a distinct Key type, so the practical rule:
// strict equal first, otherwise compare stringified forms.
export const dwSimilar = (l, r) => {
  if (l === r) return true;
  if (l == null || r == null) return false;
  return String(l) === String(r);
};

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
    // `-` overloaded: object on the left → field removal; otherwise numeric subtract.
    case "-":
      if (l && typeof l === "object" && !Array.isArray(l) && l.__closure !== true) return dwObjectMinus(l, r);
      return dwSub(l, r);
    case "*":  return dwMul(l, r);
    case "/":  return dwDiv(l, r);
    case "++": return dwConcat(l, r);
    case "==": return dwEq(l, r);
    case "!=": return dwNeq(l, r);
    case "~=": return dwSimilar(l, r);
    case "<":  return dwLt(l, r);
    case ">":  return dwGt(l, r);
    case "<=": return dwLte(l, r);
    case ">=": return dwGte(l, r);
    default: throw new Error(`Unknown operator ${op}`);
  }
}
