// Tiny shared factory + key normaliser used across stdlib categories.
// Keeping these here avoids a circular import with evaluator.js.

export function makeBuiltin(name, params, invoke) {
  return { __closure: true, __native: true, name, params, invoke };
}

// Stringify a value into a stable map-key — used by distinctBy / groupBy
// to compare lambda outputs. Real DataWeave coerces to its internal `Key`
// type; JSON.stringify is a close-enough proxy.
export function keyOf(v) {
  if (v === null || v === undefined) return "null";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

// Truthiness mirror of dwBool (kept inline here too to avoid pulling in
// semantics.js from every stdlib file).
export function dwBool(v) {
  return Boolean(v);
}
