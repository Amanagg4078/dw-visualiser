// Object stdlib. Object HOFs take `(value, key, index)` lambdas — keep that
// convention in mind when reading the invoke bodies below.

import { makeBuiltin } from "./_makeBuiltin.js";

const dwBool = (v) => Boolean(v);
const isObj = (v) => v != null && typeof v === "object" && !Array.isArray(v);
const isFn  = (v) => v && v.__closure === true;

export const BUILTINS = {
  filterObject: makeBuiltin("filterObject", ["obj", "lambda"], (args, ctx) => {
    const [obj, lambda] = args;
    if (obj == null) return null;
    if (!isObj(obj)) return null;
    if (!isFn(lambda)) throw new Error("filterObject: second argument must be a function");
    const out = {};
    let i = 0;
    for (const [k, v] of Object.entries(obj)) {
      if (dwBool(ctx.invokeLambda(lambda, [v, k, i]))) out[k] = v;
      i++;
    }
    return out;
  }),

  mapObject: makeBuiltin("mapObject", ["obj", "lambda"], (args, ctx) => {
    const [obj, lambda] = args;
    if (obj == null) return null;
    if (!isObj(obj)) return null;
    if (!isFn(lambda)) throw new Error("mapObject: second argument must be a function");
    const out = {};
    let i = 0;
    for (const [k, v] of Object.entries(obj)) {
      const piece = ctx.invokeLambda(lambda, [v, k, i]);
      if (piece && typeof piece === "object" && !Array.isArray(piece)) {
        for (const [pk, pv] of Object.entries(piece)) out[pk] = pv;
      }
      i++;
    }
    return out;
  }),

  pluck: makeBuiltin("pluck", ["obj", "lambda"], (args, ctx) => {
    const [obj, lambda] = args;
    if (obj == null) return null;
    if (!isObj(obj)) return null;
    if (!isFn(lambda)) throw new Error("pluck: second argument must be a function");
    const out = [];
    let i = 0;
    for (const [k, v] of Object.entries(obj)) {
      out.push(ctx.invokeLambda(lambda, [v, k, i]));
      i++;
    }
    return out;
  }),

  // ─── New ─────────────────────────────────────────────────────────────
  keysOf: makeBuiltin("keysOf", ["obj"], (args) => {
    const [obj] = args;
    if (obj == null || !isObj(obj)) return null;
    return Object.keys(obj);
  }),

  valuesOf: makeBuiltin("valuesOf", ["obj"], (args) => {
    const [obj] = args;
    if (obj == null || !isObj(obj)) return null;
    return Object.values(obj);
  }),

  // Real DW's namesOf returns the names of an object's fields as Strings
  // (vs keysOf which returns them as the `Key` type). We don't have a
  // distinct Key type, so the output is identical to keysOf — kept as a
  // separate built-in for parity with scripts that use one or the other.
  namesOf: makeBuiltin("namesOf", ["obj"], (args) => {
    const [obj] = args;
    if (obj == null || !isObj(obj)) return null;
    return Object.keys(obj).map(String);
  }),
};

export const HOF_NAMES = ["filterObject", "mapObject", "pluck"];
