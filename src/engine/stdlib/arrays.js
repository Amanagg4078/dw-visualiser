// Array stdlib. Every HOF expects an Array as its first argument and a
// closure (`{ __closure: true, params, body, captured }`) as its second.
// Built-ins are invoked through the evaluator's `Call` branch, which hands
// each `invoke` a context object exposing `invokeLambda(closure, args)`.
//
// HOF_NAMES (exported at the bottom) is the subset of names eligible for
// `$`/`$$`/`$$$` implicit-param sugar — real DW restricts that to its
// built-in HOFs and we mirror the rule.

import { makeBuiltin, keyOf, dwBool } from "./_makeBuiltin.js";

// ─── Shape guards ─────────────────────────────────────────────────────
const isArr = (v) => Array.isArray(v);
const isFn  = (v) => v && v.__closure === true;

export const BUILTINS = {
  // ─── HOFs from chapters 7 ──────────────────────────────────────────
  filter: makeBuiltin("filter", ["arr", "lambda"], (args, ctx) => {
    const [arr, lambda] = args;
    if (arr == null) return null;
    if (!isArr(arr)) return null;
    if (!isFn(lambda)) throw new Error("filter: second argument must be a function");
    const out = [];
    for (let i = 0; i < arr.length; i++) {
      if (dwBool(ctx.invokeLambda(lambda, [arr[i], i]))) out.push(arr[i]);
    }
    return out;
  }),

  map: makeBuiltin("map", ["arr", "lambda"], (args, ctx) => {
    const [arr, lambda] = args;
    if (arr == null) return null;
    if (!isArr(arr)) return null;
    if (!isFn(lambda)) throw new Error("map: second argument must be a function");
    const out = new Array(arr.length);
    for (let i = 0; i < arr.length; i++) out[i] = ctx.invokeLambda(lambda, [arr[i], i]);
    return out;
  }),

  reduce: makeBuiltin("reduce", ["arr", "lambda"], (args, ctx) => {
    const [arr, lambda] = args;
    if (arr == null || !isArr(arr)) return null;
    if (!isFn(lambda)) throw new Error("reduce: second argument must be a function");
    // Lambda is `(item, accumulator) -> newAccumulator`.
    // If the accumulator param has a declared default, that's the initial
    // value and we iterate over every index. Otherwise the accumulator seeds
    // from arr[0] and iteration starts at index 1 (matches real DW).
    const hasAccDefault = !!(lambda.paramDefaults && lambda.paramDefaults[1]);
    let acc, startIdx;
    if (hasAccDefault) {
      acc = ctx.evalParamDefault(lambda, 1);
      startIdx = 0;
    } else {
      if (arr.length === 0) return null;
      acc = arr[0];
      startIdx = 1;
    }
    for (let i = startIdx; i < arr.length; i++) {
      acc = ctx.invokeLambda(lambda, [arr[i], acc]);
    }
    return acc;
  }),

  distinctBy: makeBuiltin("distinctBy", ["arr", "lambda"], (args, ctx) => {
    const [arr, lambda] = args;
    if (arr == null || !isArr(arr)) return null;
    if (!isFn(lambda)) throw new Error("distinctBy: second argument must be a function");
    const seen = new Set();
    const out = [];
    for (let i = 0; i < arr.length; i++) {
      const k = keyOf(ctx.invokeLambda(lambda, [arr[i], i]));
      if (!seen.has(k)) { seen.add(k); out.push(arr[i]); }
    }
    return out;
  }),

  groupBy: makeBuiltin("groupBy", ["arr", "lambda"], (args, ctx) => {
    const [arr, lambda] = args;
    if (arr == null || !isArr(arr)) return null;
    if (!isFn(lambda)) throw new Error("groupBy: second argument must be a function");
    const groups = {};
    for (let i = 0; i < arr.length; i++) {
      const k = keyOf(ctx.invokeLambda(lambda, [arr[i], i]));
      if (!Object.prototype.hasOwnProperty.call(groups, k)) groups[k] = [];
      groups[k].push(arr[i]);
    }
    return groups;
  }),

  // ─── Newly added (stdlib v1) ──────────────────────────────────────────
  flatten: makeBuiltin("flatten", ["arr"], (args) => {
    const [arr] = args;
    if (arr == null) return null;
    if (!isArr(arr)) return null;
    // DW's flatten is one level deep.
    const out = [];
    for (const x of arr) {
      if (Array.isArray(x)) out.push(...x);
      else out.push(x);
    }
    return out;
  }),

  flatMap: makeBuiltin("flatMap", ["arr", "lambda"], (args, ctx) => {
    const [arr, lambda] = args;
    if (arr == null || !isArr(arr)) return null;
    if (!isFn(lambda)) throw new Error("flatMap: second argument must be a function");
    const out = [];
    for (let i = 0; i < arr.length; i++) {
      const piece = ctx.invokeLambda(lambda, [arr[i], i]);
      if (Array.isArray(piece)) out.push(...piece);
      else if (piece !== null && piece !== undefined) out.push(piece);
    }
    return out;
  }),

  // Sort ascending by the lambda's output. Stable. Returns a new array.
  // Mixed-type keys fall back to string comparison.
  orderBy: makeBuiltin("orderBy", ["arr", "lambda"], (args, ctx) => {
    const [arr, lambda] = args;
    if (arr == null || !isArr(arr)) return null;
    if (!isFn(lambda)) throw new Error("orderBy: second argument must be a function");
    // Decorate-sort-undecorate to keep stable order on equal keys.
    const decorated = arr.map((item, i) => ({ item, i, key: ctx.invokeLambda(lambda, [item, i]) }));
    decorated.sort((a, b) => {
      const ka = a.key, kb = b.key;
      if (ka === kb) return a.i - b.i;
      if (ka == null) return -1;
      if (kb == null) return 1;
      if (typeof ka === "number" && typeof kb === "number") return ka - kb;
      const sa = String(ka), sb = String(kb);
      return sa < sb ? -1 : sa > sb ? 1 : a.i - b.i;
    });
    return decorated.map((d) => d.item);
  }),

  sum: makeBuiltin("sum", ["arr"], (args) => {
    const [arr] = args;
    if (arr == null || !isArr(arr)) return 0;
    let acc = 0;
    for (const x of arr) if (typeof x === "number") acc += x;
    return acc;
  }),

  sumBy: makeBuiltin("sumBy", ["arr", "lambda"], (args, ctx) => {
    const [arr, lambda] = args;
    if (arr == null || !isArr(arr)) return 0;
    if (!isFn(lambda)) throw new Error("sumBy: second argument must be a function");
    let acc = 0;
    for (let i = 0; i < arr.length; i++) {
      const v = ctx.invokeLambda(lambda, [arr[i], i]);
      if (typeof v === "number") acc += v;
    }
    return acc;
  }),

  avg: makeBuiltin("avg", ["arr"], (args) => {
    const [arr] = args;
    if (arr == null || !isArr(arr) || arr.length === 0) return null;
    let acc = 0, count = 0;
    for (const x of arr) if (typeof x === "number") { acc += x; count++; }
    return count === 0 ? null : acc / count;
  }),

  avgBy: makeBuiltin("avgBy", ["arr", "lambda"], (args, ctx) => {
    const [arr, lambda] = args;
    if (arr == null || !isArr(arr) || arr.length === 0) return null;
    if (!isFn(lambda)) throw new Error("avgBy: second argument must be a function");
    let acc = 0, count = 0;
    for (let i = 0; i < arr.length; i++) {
      const v = ctx.invokeLambda(lambda, [arr[i], i]);
      if (typeof v === "number") { acc += v; count++; }
    }
    return count === 0 ? null : acc / count;
  }),

  min: makeBuiltin("min", ["arr"], (args) => {
    const [arr] = args;
    if (arr == null || !isArr(arr) || arr.length === 0) return null;
    let best = arr[0];
    for (const x of arr) if (x < best) best = x;
    return best;
  }),

  max: makeBuiltin("max", ["arr"], (args) => {
    const [arr] = args;
    if (arr == null || !isArr(arr) || arr.length === 0) return null;
    let best = arr[0];
    for (const x of arr) if (x > best) best = x;
    return best;
  }),

  minBy: makeBuiltin("minBy", ["arr", "lambda"], (args, ctx) => {
    const [arr, lambda] = args;
    if (arr == null || !isArr(arr) || arr.length === 0) return null;
    if (!isFn(lambda)) throw new Error("minBy: second argument must be a function");
    let best = arr[0], bestKey = ctx.invokeLambda(lambda, [arr[0], 0]);
    for (let i = 1; i < arr.length; i++) {
      const k = ctx.invokeLambda(lambda, [arr[i], i]);
      if (k < bestKey) { best = arr[i]; bestKey = k; }
    }
    return best;
  }),

  maxBy: makeBuiltin("maxBy", ["arr", "lambda"], (args, ctx) => {
    const [arr, lambda] = args;
    if (arr == null || !isArr(arr) || arr.length === 0) return null;
    if (!isFn(lambda)) throw new Error("maxBy: second argument must be a function");
    let best = arr[0], bestKey = ctx.invokeLambda(lambda, [arr[0], 0]);
    for (let i = 1; i < arr.length; i++) {
      const k = ctx.invokeLambda(lambda, [arr[i], i]);
      if (k > bestKey) { best = arr[i]; bestKey = k; }
    }
    return best;
  }),

  // `contains` is overloaded for both strings and arrays — real DW dispatches
  // on the type of the first argument. Note that for objects we DON'T treat
  // `contains` as "has key"; real DW uses `contains` on Array/String only.
  contains: makeBuiltin("contains", ["target", "needle"], (args) => {
    const [target, needle] = args;
    if (target == null) return false;
    if (typeof target === "string") return target.indexOf(String(needle)) !== -1;
    if (Array.isArray(target)) {
      const k = keyOf(needle);
      for (const x of target) if (keyOf(x) === k) return true;
      return false;
    }
    return false;
  }),
};

// HOFs eligible for `$`/`$$`/`$$$` implicit-param sugar.
export const HOF_NAMES = [
  "filter", "map", "reduce", "distinctBy", "groupBy",
  "flatMap", "orderBy", "sumBy", "avgBy", "minBy", "maxBy",
];
