// Type / introspection helpers. Returned type names match real DW where
// possible — "String", "Number", "Boolean", "Array", "Object", "Null",
// "Function" (for closures).

import { makeBuiltin } from "./_makeBuiltin.js";

function typeName(v) {
  if (v === null || v === undefined) return "Null";
  if (typeof v === "string") return "String";
  if (typeof v === "number") return "Number";
  if (typeof v === "boolean") return "Boolean";
  if (Array.isArray(v)) return "Array";
  if (typeof v === "object" && v.__closure === true) return "Function";
  if (typeof v === "object") return "Object";
  return "Any";
}

export const BUILTINS = {
  typeOf: makeBuiltin("typeOf", ["v"], (args) => typeName(args[0])),

  isEmpty: makeBuiltin("isEmpty", ["v"], (args) => {
    const v = args[0];
    if (v == null) return true;
    if (typeof v === "string" || Array.isArray(v)) return v.length === 0;
    if (typeof v === "object") return Object.keys(v).length === 0;
    return false;
  }),

  isString:  makeBuiltin("isString",  ["v"], (args) => typeof args[0] === "string"),
  isNumber:  makeBuiltin("isNumber",  ["v"], (args) => typeof args[0] === "number"),
  isBoolean: makeBuiltin("isBoolean", ["v"], (args) => typeof args[0] === "boolean"),
  isArray:   makeBuiltin("isArray",   ["v"], (args) => Array.isArray(args[0])),
  isObject:  makeBuiltin("isObject",  ["v"], (args) =>
    args[0] != null && typeof args[0] === "object" && !Array.isArray(args[0]) && args[0].__closure !== true
  ),
  isNull:    makeBuiltin("isNull",    ["v"], (args) => args[0] === null || args[0] === undefined),
};

// Exposed for the evaluator's `is`/`as` operator implementations later.
export { typeName };
