import { makeBuiltin } from "./_makeBuiltin.js";

export const BUILTINS = {
  ceil: makeBuiltin("ceil", ["n"], (args) => {
    const n = args[0];
    return typeof n === "number" ? Math.ceil(n) : null;
  }),

  floor: makeBuiltin("floor", ["n"], (args) => {
    const n = args[0];
    return typeof n === "number" ? Math.floor(n) : null;
  }),

  // DW's round is half-away-from-zero on .5 (banker-free).
  round: makeBuiltin("round", ["n"], (args) => {
    const n = args[0];
    if (typeof n !== "number") return null;
    return Math.sign(n) * Math.round(Math.abs(n));
  }),

  // DW's randomInt(n) returns a number in [0, n). We use Math.random().
  // Non-deterministic — outputs WILL diverge from the real runtime on a
  // per-run basis (documented in the regression script).
  randomInt: makeBuiltin("randomInt", ["n"], (args) => {
    const n = args[0];
    if (typeof n !== "number" || n <= 0) return 0;
    return Math.floor(Math.random() * n);
  }),

  random: makeBuiltin("random", [], () => Math.random()),
};
