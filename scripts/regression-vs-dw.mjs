// Regression test: run a battery of DataWeave scripts through our engine
// AND the public `dataweave.mulesoft.com/transform` runtime, then diff
// outputs. Catches semantic drift introduced by recent engine changes.
//
// Usage (from dw-engine/):
//   node scripts/regression-vs-dw.mjs
//
// Exits non-zero if any case diverges.

import { run } from "../src/engine/index.js";

const DW_URL = "https://dataweave.mulesoft.com/transform";

async function callRealDW(script, payload) {
  const body = {
    main: "/main.dwl",
    inputs: {
      payload: {
        value: typeof payload === "string" ? payload : JSON.stringify(payload),
        kind: "text",
        encoding: "UTF-8",
        mimeType: "application/json",
        properties: {},
      },
    },
    fs: { "/main.dwl": script },
  };
  const res = await fetch(DW_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!json.success) throw new Error("DW compile/runtime error: " + (json.error?.message || JSON.stringify(json.error)));
  return JSON.parse(json.result.content);
}

// Each case: a script + payload + a short description of which features it
// exercises. We compare deep-equal on the parsed JSON output.
const CASES = [
  {
    name: "literals + arithmetic + var",
    script: `%dw 2.0
output application/json
var tax = 0.1
---
{ s: 1 + 2 * 3, t: (1 + 2) * 3, taxAmt: payload.price * tax }`,
    payload: { price: 100 },
  },
  {
    name: "string concat ++ with mixed types",
    script: `%dw 2.0
output application/json
---
{ greeting: "Hi, " ++ payload.name ++ "! (id=" ++ payload.id ++ ")" }`,
    payload: { name: "Aman", id: 42 },
  },
  {
    name: "selectors: dot / index / range / multi-value / descendants",
    script: `%dw 2.0
output application/json
---
{
  first:        payload.items[0].name,
  last:         payload.items[-1].name,
  slice:        payload.items[0 to 1],
  allNames:     payload.items.*name,
  allIdsDeep:   payload..id
}`,
    payload: {
      items: [
        { id: 1, name: "A", sub: { id: 11 } },
        { id: 2, name: "B" },
        { id: 3, name: "C" },
      ],
    },
  },
  {
    name: "logical operators (and/or/not) + comparisons",
    script: `%dw 2.0
output application/json
---
{
  a: payload.x > 5 and payload.x < 20,
  b: payload.x < 5 or payload.x > 20,
  c: not (payload.x == 10),
  d: payload.x >= 10 and payload.x <= 10
}`,
    payload: { x: 10 },
  },
  {
    name: "if/else expression",
    script: `%dw 2.0
output application/json
---
{
  status: if (payload.age >= 18) "adult" else "minor",
  scale:  if (payload.score > 90) "A" else if (payload.score > 70) "B" else "C"
}`,
    payload: { age: 21, score: 85 },
  },
  {
    name: "match (literal pattern matching)",
    script: `%dw 2.0
output application/json
---
{
  action: payload.action match {
    case "buy"  -> "Buy at market"
    case "sell" -> "Sell at market"
    else        -> "Unknown"
  }
}`,
    payload: { action: "sell" },
  },
  {
    name: "fun + recursion (factorial)",
    script: `%dw 2.0
output application/json
fun fact(n) = if (n <= 1) 1 else n * fact(n - 1)
---
{ f5: fact(5), f0: fact(0), f1: fact(1) }`,
    payload: {},
  },
  {
    name: "lambdas + closures + first-class fns",
    script: `%dw 2.0
output application/json
var pi = 3.14
var area = (r) -> pi * r * r
fun applyTwice(f, x) = f(f(x))
---
{
  ring: area(5),
  twice: applyTwice((x) -> x + 1, 10)
}`,
    payload: {},
  },
  {
    name: "filter + map + reduce composed",
    script: `%dw 2.0
output application/json
---
{
  evensTimesTen: payload filter ($ > 2) map ($ * 10),
  sum:           payload reduce ((n, t) -> t + n),
  sumWithStart:  payload reduce ((n, t = 100) -> t + n)
}`,
    payload: [1, 2, 3, 4, 5],
  },
  {
    name: "distinctBy + groupBy",
    script: `%dw 2.0
output application/json
---
{
  uniqueRoles: payload distinctBy $.role,
  byRole:      payload groupBy $.role
}`,
    payload: [
      { name: "A", role: "admin" },
      { name: "B", role: "user" },
      { name: "C", role: "admin" },
      { name: "D", role: "user" },
    ],
  },
  {
    name: "filterObject + mapObject + pluck",
    script: `%dw 2.0
output application/json
---
{
  kept:    payload filterObject ((v, k, idx) -> v != null),
  upper:   payload mapObject ((v, k, idx) -> { (upper(k)): v }),
  values:  payload pluck ((v, k, idx) -> v)
}`,
    payload: { a: 1, b: null, c: "hello", d: 4 },
  },
  {
    name: "update operator (single + multiple cases)",
    script: `%dw 2.0
output application/json
---
{
  single: payload update { case n at .age -> n + 1 },
  multi: payload update {
    case n at .name -> upper(n)
    case a at .age -> a * 2
  }
}`,
    payload: { name: "alice", age: 25 },
  },
  {
    name: "null-safe selectors and missing field → null",
    script: `%dw 2.0
output application/json
---
{
  missing:     payload.user.middleName,
  deepMissing: payload.does.not.exist,
  nullChain:   payload.user.age
}`,
    payload: { user: { name: "Alice", age: null } },
  },
  {
    name: "$ syntax for built-in HOFs",
    script: `%dw 2.0
output application/json
---
{
  big:    payload filter ($ > 5),
  scaled: payload map ($ * 2),
  uniqs:  payload distinctBy $
}`,
    payload: [1, 6, 8, 6, 3, 10, 8],
  },
  {
    name: "infix chained HOFs",
    script: `%dw 2.0
output application/json
---
payload filter ($ > 2) map ($ + 100) filter ($ < 200)`,
    payload: [1, 2, 3, 50, 99, 150, 200],
  },

  // ─── Composite scenarios (user-requested coverage) ───────────────────────
  {
    name: "map → filter (transform then narrow)",
    script: `%dw 2.0
output application/json
---
payload map ($ * 10) filter ($ > 30)`,
    payload: [1, 2, 3, 4, 5],
  },
  {
    name: "filterObject → mapObject (chained object transforms)",
    script: `%dw 2.0
output application/json
---
payload filterObject ((v, k, idx) -> v > 1) mapObject ((v, k, idx) -> { (upper(k)): v * 100 })`,
    payload: { a: 1, b: 2, c: 3 },
  },
  {
    name: "nested object transformation (map building deeply-nested results)",
    script: `%dw 2.0
output application/json
---
payload map ((order, idx) -> {
  id: order.id,
  totals: {
    itemCount:  sizeOf(order.items),
    discounted: order.items map ((it, i) -> { name: it.name, finalPrice: it.price - (it.price * order.discount) })
  }
})`,
    payload: {
      // top-level is an array
    },
    // we'll pass the array directly via the wrapper below
    payloadOverride: [
      { id: "A1", discount: 0.1, items: [ { name: "Pen", price: 100 }, { name: "Mug", price: 50 } ] },
      { id: "B2", discount: 0,   items: [ { name: "Book", price: 200 } ] },
    ],
  },
  {
    name: "null handling — missing nested paths return null, not undefined",
    script: `%dw 2.0
output application/json
---
{
  missingLeaf:   payload.user.middleName,
  missingDeep:   payload.a.b.c.d,
  presentNull:   payload.user.age,
  fallback:      if (payload.user.middleName != null) payload.user.middleName else "(none)"
}`,
    payload: { user: { name: "Alice", age: null } },
  },
  {
    name: "mixed array+object — reshape array-of-objects into object-of-arrays via groupBy + mapObject",
    script: `%dw 2.0
output application/json
---
(payload groupBy $.region) mapObject ((items, region, idx) -> {
  (region): items map ($.name)
})`,
    payload: [
      { region: "EU", name: "Alice" },
      { region: "US", name: "Bob" },
      { region: "EU", name: "Carol" },
      { region: "US", name: "Dan" },
    ],
  },
  {
    name: "aggregation — sum / min / max / count via reduce",
    script: `%dw 2.0
output application/json
---
{
  sum:   payload reduce ((n, t) -> t + n),
  min:   payload reduce ((n, m) -> if (n < m) n else m),
  max:   payload reduce ((n, m) -> if (n > m) n else m),
  count: sizeOf(payload),
  avg:   (payload reduce ((n, t) -> t + n)) / sizeOf(payload)
}`,
    payload: [10, 4, 27, 8, 15, 3, 22],
  },
  {
    name: "conditional transformation — if/else inside a map",
    script: `%dw 2.0
output application/json
---
payload map ((u, idx) -> {
  name: u.name,
  status: if (u.score >= 90) "gold" else if (u.score >= 70) "silver" else "bronze",
  bonusEligible: u.score >= 80 and u.active
})`,
    payloadOverride: [
      { name: "Alice", score: 95, active: true },
      { name: "Bob",   score: 72, active: false },
      { name: "Carol", score: 85, active: true },
      { name: "Dan",   score: 50, active: true },
    ],
  },
  {
    name: "groupBy + map + pluck — group then summarise each group",
    script: `%dw 2.0
output application/json
---
(payload groupBy $.category) pluck ((items, cat, idx) -> {
  category: cat,
  size:     sizeOf(items),
  names:    items map ($.name)
})`,
    payloadOverride: [
      { category: "fruit", name: "apple" },
      { category: "veg",   name: "carrot" },
      { category: "fruit", name: "pear" },
      { category: "fruit", name: "kiwi" },
      { category: "veg",   name: "potato" },
    ],
  },
  {
    name: "deeply chained pipeline — filter → map → distinctBy → groupBy",
    script: `%dw 2.0
output application/json
---
payload
  filter ($.active)
  map ((u, idx) -> { name: u.name, dept: u.dept })
  distinctBy $.name
  groupBy $.dept`,
    payloadOverride: [
      { name: "Alice", dept: "eng",   active: true },
      { name: "Bob",   dept: "sales", active: false },
      { name: "Carol", dept: "eng",   active: true },
      { name: "Alice", dept: "eng",   active: true }, // dup
      { name: "Dan",   dept: "sales", active: true },
    ],
  },
  {
    name: "update with multiple cases over nested data",
    script: `%dw 2.0
output application/json
---
payload update {
  case n at .name -> upper(n)
  case a at .age -> a + 1
}`,
    payloadOverride: { name: "alice", age: 29, role: "admin" },
  },

  // ─── Stdlib v1 — strings ───────────────────────────────────────────────
  // Most string fns live in `dw::core::Strings` in real DW. We expose them
  // as unqualified built-ins, but include the import so the script also
  // validates against the real runtime.
  {
    name: "strings: trim / substring / substringBefore / substringAfter",
    script: `%dw 2.0
output application/json
import * from dw::core::Strings
---
{
  trimmed: trim("   hello world   "),
  sub:     substring("hello world", 0, 5),
  before:  substringBefore("hello world", " "),
  after:   substringAfter("hello world", " ")
}`,
    payload: {},
  },
  {
    name: "strings: splitBy / joinBy / contains / startsWith / endsWith",
    script: `%dw 2.0
output application/json
---
{
  parts:        splitBy("a,b,c,d", ","),
  joined:       joinBy(["a","b","c"], "-"),
  containsX:    "hello world" contains "wor",
  notContains:  "hello world" contains "xyz",
  starts:       "hello world" startsWith "hello",
  ends:         "hello world" endsWith "world"
}`,
    payload: {},
  },
  {
    name: "strings: capitalize / camelize / dasherize / underscore",
    // Note: `pascalize` lives in our engine as a teaching convenience but
    // isn't a real-DW Strings function, so it's not in the regression.
    // Real DW's `camelize` only splits on underscores, so the input is
    // snake_case to round-trip.
    script: `%dw 2.0
output application/json
import * from dw::core::Strings
---
{
  cap:   capitalize("hello world"),
  cam:   camelize("hello_world_foo"),
  das:   dasherize("helloWorldFoo"),
  und:   underscore("helloWorldFoo")
}`,
    payload: {},
  },
  {
    name: "strings: leftPad / rightPad / repeat / reverse (string)",
    // Note: real DW's `reverse` is String-only. We also accept arrays as a
    // local convenience but only the String form is in the regression.
    script: `%dw 2.0
output application/json
import * from dw::core::Strings
---
{
  lp:  leftPad("42", 5),
  rp:  rightPad("42", 5),
  rep: repeat("ab", 3),
  rev: reverse("hello")
}`,
    payload: {},
  },

  // ─── Stdlib v1 — arrays ────────────────────────────────────────────────
  {
    name: "arrays: flatten / flatMap",
    script: `%dw 2.0
output application/json
---
{
  flat:     flatten([[1,2],[3,4],[5]]),
  flatMapd: payload flatMap ((n, idx) -> [n, n * 10])
}`,
    payloadOverride: [1, 2, 3],
  },
  {
    name: "arrays: orderBy ascending",
    script: `%dw 2.0
output application/json
---
payload orderBy $.price`,
    payloadOverride: [
      { name: "C", price: 30 },
      { name: "A", price: 10 },
      { name: "B", price: 20 },
    ],
  },
  {
    name: "arrays: sum / sumBy / avg / min / max / minBy / maxBy",
    // Note: `avgBy` is in our engine as a convenience but isn't a real-DW
    // function (DW expects users to compose `sumBy / sizeOf`).
    script: `%dw 2.0
output application/json
import * from dw::core::Arrays
---
{
  sum:    sum([1,2,3,4,5]),
  sumBy:  payload sumBy $.qty,
  avg:    avg([10, 20, 30]),
  min:    min([7, 3, 9, 1, 5]),
  max:    max([7, 3, 9, 1, 5]),
  minBy:  payload minBy $.price,
  maxBy:  payload maxBy $.price
}`,
    payloadOverride: [
      { name: "A", price: 30, qty: 2 },
      { name: "B", price: 10, qty: 5 },
      { name: "C", price: 20, qty: 1 },
    ],
  },
  {
    name: "arrays: contains (both string + array overloads)",
    script: `%dw 2.0
output application/json
---
{
  arrHas:    [1, 2, 3] contains 2,
  arrLacks:  [1, 2, 3] contains 99,
  strHas:    "hello" contains "ell",
  strLacks:  "hello" contains "xyz"
}`,
    payload: {},
  },

  // ─── Stdlib v1 — objects ───────────────────────────────────────────────
  {
    name: "objects: keysOf / valuesOf / namesOf",
    script: `%dw 2.0
output application/json
---
{
  keys:   keysOf(payload),
  vals:   valuesOf(payload),
  names:  namesOf(payload)
}`,
    payload: { a: 1, b: "two", c: true },
  },
  {
    name: "objects: ++ merge and - remove (single-key form)",
    script: `%dw 2.0
output application/json
---
{
  merged:  payload ++ { added: true, b: 999 },
  dropOne: payload - "b"
}`,
    payload: { a: 1, b: 2, c: 3, d: 4 },
  },

  // ─── Stdlib v1 — numbers ───────────────────────────────────────────────
  {
    name: "numbers: ceil / floor / round",
    script: `%dw 2.0
output application/json
---
{
  ceilUp:    ceil(3.2),
  ceilNeg:   ceil(-3.7),
  floorDn:   floor(3.7),
  floorNeg:  floor(-3.2),
  roundUp:   round(3.5),
  roundDn:   round(3.4),
  roundNeg:  round(-3.5)
}`,
    payload: {},
  },

  // ─── Stdlib v1 — types / introspection ────────────────────────────────
  // `typeOf(...)` and `isEmpty(...)` are core unqualified built-ins in real
  // DW. Per-type predicates (`isString`/`isNumber`/…) live in our engine as
  // a convenience but real DW uses the `is String` / `is Number` operator
  // instead, which we don't ship yet — so they're not in the regression.
  {
    name: "type predicates: typeOf / isEmpty",
    script: `%dw 2.0
output application/json
---
{
  types: payload map ((v, idx) -> typeOf(v)),
  emptyChecks: {
    nullV:  isEmpty(null),
    emptyA: isEmpty([]),
    emptyO: isEmpty({}),
    emptyS: isEmpty(""),
    fullA:  isEmpty([1])
  }
}`,
    payloadOverride: ["hi", 42, true, null, [1, 2], { a: 1 }],
  },

  // ─── Standalone range literal `(n to m)` ───────────────────────────────
  {
    name: "range literal `(n to m)` (ascending + reversed + via vars)",
    script: `%dw 2.0
output application/json
var asc  = (1 to 5)
var desc = (5 to 1)
---
{
  asc:        asc,
  desc:       desc,
  inline:     (10 to 12),
  fromVar:    (payload.lo to payload.hi),
  mappedSum:  (1 to 4) reduce ((n, t) -> t + n)
}`,
    payload: { lo: 2, hi: 4 },
  },

  // ─── Stdlib v1 — operators (~= and default) ────────────────────────────
  {
    name: "~= similar-to operator",
    script: `%dw 2.0
output application/json
---
{
  numStr:    1 ~= "1",
  numNum:    1 ~= 1,
  stringEq:  "a" ~= "a",
  diff:      1 ~= 2
}`,
    payload: {},
  },
  {
    name: "default operator — fallback when lhs is null",
    script: `%dw 2.0
output application/json
---
{
  missing: payload.missing default "fallback",
  present: payload.name default "fallback",
  nullChain: payload.nested.missing.deep default 0,
  withExpr: payload.qty default (1 + 2)
}`,
    payload: { name: "Alice", qty: null },
  },

  // ─── Stdlib v1 — output directive ─────────────────────────────────────
  {
    name: "output skipNullOn=\"everywhere\" strips null fields and entries",
    script: `%dw 2.0
output application/json skipNullOn = "everywhere"
---
{
  name:    "Alice",
  middle:  null,
  age:     30,
  prefs:   [1, null, 2, null, 3],
  nested:  { a: 1, b: null, c: { x: null, y: 2 } }
}`,
    payload: {},
  },

  // ─── Composite — stdlib + existing engine features ─────────────────────
  {
    name: "composite: orderBy + map + sumBy + default",
    script: `%dw 2.0
output application/json
import * from dw::core::Arrays
---
{
  sortedNames:   (payload orderBy $.price) map $.name,
  totalRevenue:  payload sumBy ($.price * $.qty),
  maxName:       (payload maxBy $.price).name,
  fallback:      payload.missingKey default "n/a"
}`,
    payloadOverride: [
      { name: "C", price: 30, qty: 2 },
      { name: "A", price: 10, qty: 5 },
      { name: "B", price: 20, qty: 1 },
    ],
  },
];

// Deep-equal a structure ignoring object key order for objects.
function deepEq(a, b) {
  if (a === b) return true;
  if (a === null || b === null) return a === b;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object") return a === b;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    return a.every((x, i) => deepEq(x, b[i]));
  }
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (!Object.prototype.hasOwnProperty.call(b, k) || !deepEq(a[k], b[k])) return false;
  return true;
}

let pass = 0, fail = 0;
for (const c of CASES) {
  // Allow either `payload` (object form) or `payloadOverride` (any shape,
  // including arrays — `payload:` would otherwise look ambiguous in JSON).
  const payload = c.payloadOverride !== undefined ? c.payloadOverride : c.payload;
  let ours, theirs, oursErr, theirsErr;
  try { ours = run(c.script, payload).result; } catch (e) { oursErr = e.message; }
  try { theirs = await callRealDW(c.script, payload); } catch (e) { theirsErr = e.message; }
  const ok = !oursErr && !theirsErr && deepEq(ours, theirs);
  if (ok) {
    pass++;
    console.log(`PASS  ${c.name}`);
  } else {
    fail++;
    console.log(`FAIL  ${c.name}`);
    if (oursErr) console.log(`  ours error:   ${oursErr}`);
    else         console.log(`  ours:    ${JSON.stringify(ours)}`);
    if (theirsErr) console.log(`  theirs error: ${theirsErr}`);
    else           console.log(`  theirs:  ${JSON.stringify(theirs)}`);
  }
}

console.log(`\n${pass}/${pass + fail} cases match real DataWeave runtime`);
process.exit(fail === 0 ? 0 : 1);
