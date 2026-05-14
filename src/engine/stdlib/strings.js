// String stdlib. All functions here take a String as the first arg (except
// joinBy, which takes an Array). null inputs propagate to null.

import { makeBuiltin } from "./_makeBuiltin.js";

const asString = (v) => v == null ? null : String(v);

export const BUILTINS = {
  upper: makeBuiltin("upper", ["s"], (args) => {
    const s = asString(args[0]);
    return s == null ? null : s.toUpperCase();
  }),

  lower: makeBuiltin("lower", ["s"], (args) => {
    const s = asString(args[0]);
    return s == null ? null : s.toLowerCase();
  }),

  // Polymorphic — array / string / object.
  sizeOf: makeBuiltin("sizeOf", ["v"], (args) => {
    const v = args[0];
    if (v == null) return 0;
    if (Array.isArray(v) || typeof v === "string") return v.length;
    if (typeof v === "object") return Object.keys(v).length;
    return 0;
  }),

  trim: makeBuiltin("trim", ["s"], (args) => {
    const s = asString(args[0]);
    return s == null ? null : s.trim();
  }),

  // DW's substring is (str, fromInclusive, untilExclusive).
  substring: makeBuiltin("substring", ["s", "from", "until"], (args) => {
    const s = asString(args[0]);
    if (s == null) return null;
    const from  = typeof args[1] === "number" ? args[1] : 0;
    const until = typeof args[2] === "number" ? args[2] : s.length;
    return s.slice(Math.max(0, from), Math.max(0, Math.min(s.length, until)));
  }),

  substringAfter: makeBuiltin("substringAfter", ["s", "sep"], (args) => {
    const s = asString(args[0]);
    if (s == null) return null;
    const sep = asString(args[1]) ?? "";
    const i = s.indexOf(sep);
    return i === -1 ? "" : s.slice(i + sep.length);
  }),

  substringBefore: makeBuiltin("substringBefore", ["s", "sep"], (args) => {
    const s = asString(args[0]);
    if (s == null) return null;
    const sep = asString(args[1]) ?? "";
    const i = s.indexOf(sep);
    return i === -1 ? "" : s.slice(0, i);
  }),

  splitBy: makeBuiltin("splitBy", ["s", "sep"], (args) => {
    const s = asString(args[0]);
    if (s == null) return null;
    const sep = asString(args[1]) ?? "";
    return sep === "" ? [...s] : s.split(sep);
  }),

  joinBy: makeBuiltin("joinBy", ["arr", "sep"], (args) => {
    const arr = args[0];
    if (arr == null || !Array.isArray(arr)) return null;
    const sep = asString(args[1]) ?? "";
    return arr.map((x) => x == null ? "" : String(x)).join(sep);
  }),

  startsWith: makeBuiltin("startsWith", ["s", "prefix"], (args) => {
    const s = asString(args[0]);
    if (s == null) return false;
    return s.startsWith(asString(args[1]) ?? "");
  }),

  endsWith: makeBuiltin("endsWith", ["s", "suffix"], (args) => {
    const s = asString(args[0]);
    if (s == null) return false;
    return s.endsWith(asString(args[1]) ?? "");
  }),

  capitalize: makeBuiltin("capitalize", ["s"], (args) => {
    const s = asString(args[0]);
    if (s == null) return null;
    // DW's capitalize uppercases the first letter of each word.
    return s.split(/(\s+)/).map((part) =>
      /^\s+$/.test(part) || part.length === 0 ? part : part[0].toUpperCase() + part.slice(1).toLowerCase()
    ).join("");
  }),

  // Word-case helpers. Real DW splits ONLY on underscores (`snake_case` →
  // `camelCase`); dashes/spaces are left as-is. We match that for camelize
  // so scripts round-trip against the real runtime. `pascalize` is a local
  // convenience and follows the same underscore-only convention.
  camelize: makeBuiltin("camelize", ["s"], (args) => {
    const s = asString(args[0]);
    if (s == null) return null;
    const parts = s.split("_");
    if (parts.length === 0) return "";
    return parts[0] + parts.slice(1).map((p) => p.length === 0 ? "" : p[0].toUpperCase() + p.slice(1)).join("");
  }),

  pascalize: makeBuiltin("pascalize", ["s"], (args) => {
    const s = asString(args[0]);
    if (s == null) return null;
    return s.split("_").filter(Boolean).map((p) => p[0].toUpperCase() + p.slice(1)).join("");
  }),

  dasherize: makeBuiltin("dasherize", ["s"], (args) => {
    const s = asString(args[0]);
    if (s == null) return null;
    return s.replace(/([a-z])([A-Z])/g, "$1-$2").replace(/[\s_]+/g, "-").toLowerCase();
  }),

  underscore: makeBuiltin("underscore", ["s"], (args) => {
    const s = asString(args[0]);
    if (s == null) return null;
    return s.replace(/([a-z])([A-Z])/g, "$1_$2").replace(/[\s-]+/g, "_").toLowerCase();
  }),

  leftPad: makeBuiltin("leftPad", ["s", "width"], (args) => {
    const s = asString(args[0]);
    if (s == null) return null;
    const w = typeof args[1] === "number" ? args[1] : 0;
    return s.length >= w ? s : " ".repeat(w - s.length) + s;
  }),

  rightPad: makeBuiltin("rightPad", ["s", "width"], (args) => {
    const s = asString(args[0]);
    if (s == null) return null;
    const w = typeof args[1] === "number" ? args[1] : 0;
    return s.length >= w ? s : s + " ".repeat(w - s.length);
  }),

  repeat: makeBuiltin("repeat", ["s", "n"], (args) => {
    const s = asString(args[0]);
    if (s == null) return null;
    const n = typeof args[1] === "number" ? Math.max(0, Math.floor(args[1])) : 0;
    return s.repeat(n);
  }),

  // Overloaded — works on both strings and arrays. DW does the same.
  reverse: makeBuiltin("reverse", ["v"], (args) => {
    const v = args[0];
    if (v == null) return null;
    if (Array.isArray(v)) return v.slice().reverse();
    if (typeof v === "string") return [...v].reverse().join("");
    return v;
  }),

  toBase64: makeBuiltin("toBase64", ["s"], (args) => {
    const s = asString(args[0]);
    if (s == null) return null;
    // Browser btoa expects Latin-1; encode as UTF-8 bytes first for correctness.
    if (typeof btoa === "function") {
      const bytes = new TextEncoder().encode(s);
      let bin = "";
      for (const b of bytes) bin += String.fromCharCode(b);
      return btoa(bin);
    }
    // Node fallback
    return globalThis.Buffer.from(s, "utf-8").toString("base64");
  }),

  fromBase64: makeBuiltin("fromBase64", ["s"], (args) => {
    const s = asString(args[0]);
    if (s == null) return null;
    if (typeof atob === "function") {
      const bin = atob(s);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new TextDecoder().decode(bytes);
    }
    return globalThis.Buffer.from(s, "base64").toString("utf-8");
  }),
};
