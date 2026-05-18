# DataWeave Visualiser

A step-through visualiser for **DataWeave 2.0** — a learner tool that traces every
evaluation step of a script so you can *see* how the language works.

> ⚠️ This is **not** a real DataWeave runtime. It's an approximation that covers
> the language slice taught in the official
> [DataWeave Interactive Tutorial](https://dataweave.mulesoft.com/learn/tutorial)
> (chapters 1–8). It runs entirely in your browser, with no backend. Validation
> against the public DataWeave API is included as a regression script — see
> [Validation](#validation-against-real-dataweave).

![DW Visualiser](public/dw-visualiser.png)

---

## What it does

- Renders a tiny DataWeave 2.0 engine (lexer → parser → tracing evaluator) in
  pure JavaScript.
- Steps through the evaluation **AST event by AST event** or
  **source line by source line** with a green ▶ on the line just executed and a
  red ▶ on the line about to execute.
- Shows the scope (vars, lambda params, payload) at every step.
- Bundles **20+ guided lessons** mirroring the official tutorial's chapters
  1–8, each with annotated walk-throughs.
- Offers a **Playground** mode for free-form scripts.

## Features

### Language coverage

| Area | Status |
|---|---|
| `%dw` directive, `output <mime>`, `---` separator | ✓ (mime parsed; only JSON emitted) |
| Literals — number, string, boolean, null | ✓ |
| Object & array literals (including **dynamic keys** `{ (expr): v }`) | ✓ |
| Operators `+ - * / ++ == != < > <= >=` | ✓ |
| Logical `and` / `or` / `not` (short-circuit) | ✓ |
| Single-value, index, **range**, multi-value, descendants selectors | ✓ |
| Standalone range literal `(n to m)` (inclusive; reverses when `n > m`) | ✓ |
| `if … else` (lazy branch evaluation) | ✓ |
| `match { case <lit> -> … else -> … }` (literal patterns) | ✓ |
| `var`, `fun` declarations, lambdas, closures, first-class fns | ✓ |
| Infix calls (`a fn b`), `$`/`$$`/`$$$` implicit params (built-in HOFs only) | ✓ |
| **Array HOFs**: `filter`, `map`, `reduce`, `distinctBy`, `groupBy` | ✓ |
| **Object HOFs**: `filterObject`, `mapObject`, `pluck` | ✓ |
| **`update` operator** (basic form: `case <bind?> at <path> -> <expr>`) | ✓ |
| `~=` similar-to, `default` null-fallback, object `++` merge, object `-` remove | ✓ |
| `output … skipNullOn = "everywhere"` directive | ✓ |
| `import * from dw::core::X` (no-op — built-ins are unqualified) | ✓ |
| **Stdlib** (~50 fns): Strings (`trim`, `substring`, `splitBy`, `joinBy`, `capitalize`, `camelize`, …), Arrays (`flatten`, `flatMap`, `orderBy`, `sum`, `sumBy`, `min`/`max`, `minBy`/`maxBy`, `contains`, …), Objects (`keysOf`, `valuesOf`, `namesOf`), Numbers (`ceil`, `floor`, `round`, `random`, …), Types (`typeOf`, `isEmpty`) | ✓ |

See [AUDIT.md](../AUDIT.md) for the full feature-by-feature audit (incl. what's
**not** yet supported and the planned stdlib roadmap).

### UX

- **Light / dark theme** with a Toggle in the header (preference persists).
- **Dual-mode stepper** — Line mode (one click = one source line) and Event mode
  (one click = one AST evaluation event).
- **Smooth animated arrows** in the gutter; the script auto-scrolls to keep the
  current line visible.
- **Draggable splitters** between left/right panes and between script/input.
- **Auto-closing pairs** for `(`, `[`, `{`, `"` in both editors. Includes
  skip-over on closers and smart-backspace for empty pairs.
- **Lessons** with annotated walk-throughs (a "Lesson" card follows the cursor
  through the script).
- **Playground** mode for free-form scripts — a red caveat banner explains the
  scope vs. real DataWeave.
- **Copy buttons** on the script, input, and final-output panels.
- **Syntax-coloured JSON view** for the final output, with MIME-type tabs in
  the (mocked) lesson 1.2.

---

## Quick start

Requires Node ≥ 20.

```bash
npm install      # one-time
npm run dev      # Vite dev server with HMR (http://localhost:5173)
npm run build    # production build → dist/
npm run preview  # serve the production build
npm run lint     # ESLint (flat config)
npm run test     # Vitest (one-shot)
npm run test:watch  # Vitest watch mode
```

Vitest is pinned to v3 — v4.x has a runner-init bug that breaks this project's
test discovery. Don't bump it without verifying.

---

## Architecture

The engine and the visualiser are decoupled — the engine is a pure JS module,
the visualiser is a single React component that consumes it.

```
src/
├── engine/
│   ├── lexer.js          tokenize(src) — produces { type, value, line, col }[]
│   ├── parser.js         parse(tokens) — recursive-descent → AST
│   ├── semantics.js      dwAdd / dwSub / dwSimilar / dwObjectMinus / … —
│   │                      single chokepoint for operator semantics; documents
│   │                      JS-vs-DW divergence
│   ├── evaluator.js      evaluate(ast, payload) — walks the AST, emits a
│   │                      trace array, returns { result, trace }
│   ├── trace.js          buildLineSteps(trace) — groups by source line for
│   │                      the line-stepping mode
│   ├── stdlib/
│   │   ├── _makeBuiltin.js   makeBuiltin/keyOf factory + helpers
│   │   ├── arrays.js         filter, map, reduce, distinctBy, groupBy,
│   │   │                      flatten, flatMap, orderBy, sum, sumBy, min,
│   │   │                      max, minBy, maxBy, contains, …
│   │   ├── objects.js        filterObject, mapObject, pluck, keysOf,
│   │   │                      valuesOf, namesOf
│   │   ├── strings.js        upper, lower, sizeOf, trim, substring,
│   │   │                      splitBy, joinBy, startsWith, endsWith,
│   │   │                      capitalize, camelize, dasherize, underscore,
│   │   │                      leftPad, rightPad, repeat, reverse, …
│   │   ├── numbers.js        ceil, floor, round, random, randomInt
│   │   ├── types.js          typeOf, isEmpty (+ engine-only is* predicates)
│   │   └── index.js          merged BUILTINS + HOF_NAMES (for $/$$/$$$
│   │                          auto-wrap)
│   └── index.js          re-exports + `run(src, payload)` convenience
├── samples/
│   └── index.js          Curated tutorial lessons + the playground seed
├── App.jsx               The single React component (UI + interactivity)
├── main.jsx              React root
└── index.css             Theme variables (light + dark) + scrollbar style
```

### Invariants worth knowing

1. **Tracing is baked into the evaluator** — every new AST `kind` must emit
   trace events from the first commit. A node that evaluates silently is a
   bug; it breaks the stepper UI.
2. **All operators go through `semantics.js`** — never use raw JS ops in
   `evalExpr`. This is the single place where the JS-vs-DW behavioural
   delta lives.
3. **Built-ins live in a registry** seeded into the root scope frame. New
   HOFs add an entry to `BUILTINS` and (if they accept `$`/`$$`/`$$$`
   implicit-lambda args) a name to `KNOWN_HOFS` in the parser.

### Adding a new language feature

The four layers are tightly coupled — extending the language usually touches
all of them:

1. **Lexer** — add any new token types in `TOK` and recognise them in
   `tokenize`. Add a lexer test.
2. **Parser** — add the new node kind at the correct precedence rung. Add a
   parser test.
3. **Evaluator** — add an `evalExpr` branch that **emits at least one trace
   event** with `phase` / `description` / `expr` / `value`. Add an evaluator
   test that asserts both the result and a key trace event.
4. **UI** — extend `exprToStr` in `evaluator.js` so the new node renders in
   the trace, and add a colour in `PHASE_COLORS` (App.jsx) if you introduced
   a new phase.

Each new feature also gets a case in
[scripts/regression-vs-dw.mjs](scripts/regression-vs-dw.mjs) — see below.

---

## Validation against real DataWeave

Every language feature is validated against the public
`https://dataweave.mulesoft.com/transform` API. A regression harness lives at
[scripts/regression-vs-dw.mjs](scripts/regression-vs-dw.mjs) — it runs a battery
of scripts through both our engine and the real runtime, then deep-compares the
parsed JSON output.

```bash
node scripts/regression-vs-dw.mjs    # exits non-zero on any divergence
```

Requires internet access. Currently **42/42 cases match real DW byte-for-byte**
across literals, every operator/selector/HOF, `update`, null handling, the
`$` sugar, infix chaining, the `~=` / `default` operators, the
`skipNullOn` output directive, the new stdlib batch (`trim`/`substring`/
`splitBy`/`joinBy`/`capitalize`/`flatten`/`orderBy`/`sumBy`/`minBy`/`maxBy`/…),
and ~10 composite scenarios (map→filter, filterObject→mapObject, nested
objects, aggregations via reduce, conditional transforms inside `map`,
groupBy→summarise, etc.).

Scripts that use functions from `dw::core::Strings` or `dw::core::Arrays`
include the corresponding `import * from dw::core::X` line, which our parser
accepts as a no-op so the same script validates against both runtimes.

When adding a new language feature, drop a case here so the next run catches
any drift.

---

## Project documents

- **[AUDIT.md](../AUDIT.md)** — comprehensive review of tutorial gaps, the
  standard-library roadmap (string / array / object / number / type / null /
  output categories), and the architectural recommendation for the next
  stdlib batch.
- **[CLAUDE.md](../CLAUDE.md)** — engineering notes for future contributors:
  feature matrix, project conventions, file-by-file map of the engine.
- **[kt.txt](../kt.txt)** — knowledge-transfer doc with the project vision
  and the phased roadmap that brought us here.

---

## Limitations

This is a teaching tool, not a production engine. The following are documented
in [AUDIT.md](../AUDIT.md) and **not** supported today:

- Output formats other than JSON (XML, CSV, YAML are mocked in lesson 1.2 only)
- Type system: `is Type`, `as Type`, type literals, parametric signatures
- `update` upsert (`!`) and guards (`if`)
- String interpolation `"$(expr)"`
- `replace … with …` infix form
- `mod` / `abs` / `pow` / `sqrt` math helpers

`import * from dw::core::X` is parsed but treated as a no-op — our stdlib is
unqualified, so the functions are reachable either way and the import keeps
scripts portable to a real DW runtime.

Numbers also use JavaScript IEEE-754 floats rather than DataWeave's
BigDecimal — so `0.1 + 0.2` will look slightly off here, but exact in a real
DW runtime.

---

## Acknowledgements

Curriculum and lesson content modelled on MuleSoft's official
[DataWeave Interactive Tutorial](https://github.com/mulesoft/data-weave-tutorial).
Pedagogical UX inspired by [Python Tutor](https://pythontutor.com/).

---

## License

Personal learning project. Not affiliated with MuleSoft.
