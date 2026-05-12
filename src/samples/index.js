// Curated tutorial samples. Each entry pairs a DataWeave script with an
// input payload and a link out to the corresponding lesson in the official
// MuleSoft tutorial — the playground supplies the *visualisation*, the
// official tutorial supplies the prose.
//
// Two flavours of sample:
// - Playground (no `annotations`): free-form, user can edit script + input.
// - Concept lesson (`annotations` array): each annotation is
//   `{ lineRange: [from, to], title, body }`. When such a sample is loaded,
//   the UI shows an annotation panel that follows the cursor's current line
//   AND locks the script + input editors (read-only) so the lesson stays on rails.
//
// Optional `mockedOutputs`: a `{ [mimeType]: string }` map. When present, the
// final-output box becomes a MIME-type selector and shows the hand-written
// mock for the chosen format. This is for lessons (like 1.2) that teach
// concepts the engine doesn't yet implement.

export const SAMPLES = [
  // ─── Chapter 1: Introduction (concept lessons) ─────────────────────────
  {
    id: "1.1-what-is-dataweave",
    chapter: "1.1",
    title: "What is DataWeave?",
    description:
      "DataWeave is a data-transformation language: it takes input (the payload), runs an expression, and produces output. This first lesson shows that whole loop with one tiny script.",
    tutorialUrl: "https://dataweave.mulesoft.com/learn/tutorial/1.1-What_is_DataWeave%3F",
    script: `%dw 2.0
output application/json
---
{
  greeting: "Hello, " ++ payload.name ++ "!"
}`,
    payload: { name: "World" },
    annotations: [
      {
        lineRange: [1, 1],
        title: "Version directive",
        body: "Every DataWeave script starts with `%dw <version>` to declare the language version. Our engine accepts 2.0.",
      },
      {
        lineRange: [2, 2],
        title: "Output format",
        body: "`output application/json` says the result will be serialised as JSON. DataWeave can also emit XML, CSV, YAML, and more — covered in lesson 1.2.",
      },
      {
        lineRange: [3, 3],
        title: "Header / body separator",
        body: "The `---` separator divides the *header* (configuration: directives, vars, functions) from the *body* (the transformation expression).",
      },
      {
        lineRange: [4, 6],
        title: "The body — a single expression",
        body: "Everything after `---` is one expression whose value is the script's output. Here it's an object literal that uses `payload` (the input) and the `++` string-concat operator to build a greeting.",
      },
    ],
  },

  {
    id: "1.2-mime-types",
    chapter: "1.2",
    title: "MIME Types",
    description:
      "The `output` directive controls what format the result is serialised to. DataWeave supports many MIME types — JSON, XML, CSV, YAML. Our engine only emits JSON, so this lesson **mocks** the other formats: switch the MIME-type tab below the script to see what a real DataWeave runtime would produce for the same body.",
    tutorialUrl: "https://dataweave.mulesoft.com/learn/tutorial/1.2-MIME_Types",
    script: `%dw 2.0
output application/json
---
[
  { id: 1, name: "Alice", role: "admin" },
  { id: 2, name: "Bob",   role: "user"  }
]`,
    payload: {},
    annotations: [
      {
        lineRange: [1, 1],
        title: "Same %dw directive",
        body: "Every script starts here. The MIME-type discussion is about the *next* line.",
      },
      {
        lineRange: [2, 2],
        title: "The output MIME type",
        body: "`output <mime>` tells DataWeave how to serialise the body's value. Common values: `application/json`, `application/xml`, `application/csv`, `application/yaml`. Use the **MIME-type tabs** in the Final Output panel to see how the *same* body changes shape per format.",
      },
      {
        lineRange: [3, 3],
        title: "Separator",
        body: "The `---` ends the header. Everything below is the body — the value to be serialised.",
      },
      {
        lineRange: [4, 7],
        title: "The body",
        body: "An array of objects translates cleanly into every common format: a JSON array, an XML element list, CSV rows, a YAML sequence. The *value* is identical — only the *serialisation* changes.",
      },
    ],
    mockedOutputs: {
      "application/json": `[
  { "id": 1, "name": "Alice", "role": "admin" },
  { "id": 2, "name": "Bob",   "role": "user"  }
]`,
      "application/xml": `<?xml version="1.0" encoding="UTF-8"?>
<root>
  <user>
    <id>1</id>
    <name>Alice</name>
    <role>admin</role>
  </user>
  <user>
    <id>2</id>
    <name>Bob</name>
    <role>user</role>
  </user>
</root>`,
      "application/csv": `id,name,role
1,Alice,admin
2,Bob,user`,
      "application/yaml": `- id: 1
  name: Alice
  role: admin
- id: 2
  name: Bob
  role: user`,
    },
  },

  {
    id: "1.3-script-anatomy",
    chapter: "1.3",
    title: "Script Anatomy",
    description:
      "Every DataWeave script has the same skeleton: %dw directive, header (output + vars + functions), the `---` separator, and a single body expression. This lesson walks through every part.",
    tutorialUrl: "https://dataweave.mulesoft.com/learn/tutorial/1.3-Script_Anatomy",
    script: `%dw 2.0
output application/json
var greeting = "Hello"
var subject  = payload.name
---
{
  message:    greeting ++ ", " ++ subject ++ "!",
  echoedBack: payload
}`,
    payload: { name: "DataWeave" },
    annotations: [
      {
        lineRange: [1, 1],
        title: "1. Version directive",
        body: "Tells the runtime which version of the language to use. Required — must be the first non-blank line.",
      },
      {
        lineRange: [2, 2],
        title: "2. Output declaration",
        body: "Part of the *header*. Specifies the output MIME type. Optional in our engine (defaults to JSON).",
      },
      {
        lineRange: [3, 4],
        title: "3. Header variables",
        body: "`var name = expr` binds a value. Vars run **before** the body and stay available throughout. They can reference each other in declaration order, and they can reference `payload`.",
      },
      {
        lineRange: [5, 5],
        title: "4. The separator",
        body: "`---` ends the header and starts the body. Required.",
      },
      {
        lineRange: [6, 9],
        title: "5. The body expression",
        body: "Exactly one expression. Its value is the script's output. It can use `payload`, any var declared above, any operator, and any function. Here it's an object literal — the most common shape.",
      },
    ],
  },

  // ─── Chapter 2: Creating Data (concept lessons) ─────────────────────────
  {
    id: "2.1-strings",
    chapter: "2.1",
    title: "Strings",
    description:
      "Strings are sequences of characters in double quotes. DataWeave 2.0 uses `\"…\"` (single quotes are reserved). You can concatenate with `++` and (in a real runtime) interpolate with `\"$(expr)\"`.",
    tutorialUrl: "https://dataweave.mulesoft.com/learn/tutorial/2.1-Strings",
    script: String.raw`%dw 2.0
output application/json
---
{
  hello:        "Hello, World!",
  doubleQuoted: "Use double quotes around your text",
  withEscape:   "She said \"hi\"",
  empty:        "",
  fromPayload:  payload.greeting,
  concatenated: "Hello, " ++ payload.name ++ "!"
}`,
    payload: { name: "Aman", greeting: "g'day" },
    annotations: [
      {
        lineRange: [1, 3],
        title: "Standard header",
        body: "`%dw` + `output` + `---` separator. Same as every script. The lesson begins below.",
      },
      {
        lineRange: [5, 5],
        title: "Basic string literal",
        body: "Most strings are just text in `\"…\"`. Any Unicode character is allowed inside.",
      },
      {
        lineRange: [6, 6],
        title: "Double quotes only",
        body: "DataWeave 2.0 uses **double quotes** for strings. Single quotes (`'…'`) are reserved for character literals in certain contexts — using them for strings is a parse error.",
      },
      {
        lineRange: [7, 7],
        title: "Escape sequences",
        body: "Backslash escapes special characters inside a string. `\\\"` gives a literal double-quote; `\\\\` gives a literal backslash.",
      },
      {
        lineRange: [8, 8],
        title: "Empty strings",
        body: "An empty string is `\"\"` — zero characters between two quotes.",
      },
      {
        lineRange: [9, 9],
        title: "Strings from the payload",
        body: "Selectors like `payload.greeting` return whatever value is at that path. If the path holds a string, you get a string.",
      },
      {
        lineRange: [10, 10],
        title: "Concatenation with `++`",
        body: "The `++` operator joins two strings. It coerces both sides to text (so `\"count: \" ++ 3` works). Real DataWeave also supports `\"hello $(name)\"` interpolation — coming to our engine in a future lesson.",
      },
    ],
  },

  {
    id: "2.2-numbers",
    chapter: "2.2",
    title: "Numbers",
    description:
      "DataWeave has a single Number type covering integers and decimals. Standard arithmetic operators apply with the usual precedence.",
    tutorialUrl: "https://dataweave.mulesoft.com/learn/tutorial/2.2-Numbers",
    script: `%dw 2.0
output application/json
---
{
  integer:    42,
  decimal:    3.14,
  negative:   -7,
  big:        1000000,
  sum:        1 + 2 + 3,
  product:    4 * 5,
  division:   22 / 7,
  precedence: 2 + 3 * 4,
  grouped:    (2 + 3) * 4
}`,
    payload: {},
    annotations: [
      {
        lineRange: [1, 3],
        title: "Standard header",
        body: "Header + separator. Lesson body starts below.",
      },
      {
        lineRange: [5, 5],
        title: "Integers",
        body: "Plain digits. No `int` vs `long` distinction in DataWeave — there's just **Number**.",
      },
      {
        lineRange: [6, 6],
        title: "Decimals",
        body: "Use a `.` for fractional parts. In a real DataWeave runtime, numbers are arbitrary-precision (BigDecimal). **Caveat:** our engine uses JavaScript floats — `0.1 + 0.2` will show as `0.30000000000000004` here, but a real runtime gives exactly `0.3`.",
      },
      {
        lineRange: [7, 7],
        title: "Negative numbers",
        body: "Prefix with unary `-`. Internally this is the `-` operator applied to a positive literal.",
      },
      {
        lineRange: [8, 8],
        title: "Large numbers",
        body: "No need for `_` separators; just write the digits.",
      },
      {
        lineRange: [9, 11],
        title: "Arithmetic operators",
        body: "`+`, `-`, `*`, `/` work as expected. Division of integers gives a decimal result.",
      },
      {
        lineRange: [12, 13],
        title: "Operator precedence",
        body: "`*` and `/` bind tighter than `+` and `-` — so `2 + 3 * 4` is `2 + 12 = 14`. Wrap in `(…)` to override.",
      },
    ],
  },

  {
    id: "2.3-booleans",
    chapter: "2.3",
    title: "Booleans",
    description:
      "Booleans are either `true` or `false`. Comparison operators produce booleans you can use in flow control later.",
    tutorialUrl: "https://dataweave.mulesoft.com/learn/tutorial/2.3-Booleans",
    script: `%dw 2.0
output application/json
---
{
  yes:           true,
  no:            false,
  equality:      1 == 1,
  inequality:    "a" != "b",
  lessThan:      3 < 5,
  greaterThan:   5 > 3,
  mixed:         1 == "1",
  comparedNulls: null == null
}`,
    payload: {},
    annotations: [
      {
        lineRange: [1, 3],
        title: "Standard header",
        body: "Header + separator. Lesson body starts below.",
      },
      {
        lineRange: [5, 6],
        title: "The boolean literals",
        body: "Only two values: `true` and `false`. Lowercase — `True` won't parse.",
      },
      {
        lineRange: [7, 7],
        title: "Equality `==`",
        body: "`==` returns `true` when both sides are equal. Strings, numbers, booleans, and nulls all compare by value.",
      },
      {
        lineRange: [8, 8],
        title: "Inequality `!=`",
        body: "The opposite of `==` — `true` when the two sides are *not* equal.",
      },
      {
        lineRange: [9, 10],
        title: "Ordering: `<` and `>`",
        body: "Compare numbers (and strings, alphabetically). Returns a boolean.",
      },
      {
        lineRange: [11, 11],
        title: "Strict-typed equality",
        body: "`1 == \"1\"` is `false` in DataWeave — number and string with the same shape are still different types. Compare `as Number` to coerce.",
      },
      {
        lineRange: [12, 12],
        title: "`null == null`",
        body: "Yes — `null` is equal to `null`. This is useful in flow-control patterns we'll see in chapter 5.",
      },
    ],
  },

  {
    id: "2.4-arrays",
    chapter: "2.4",
    title: "Arrays",
    description:
      "Arrays are ordered sequences of values wrapped in `[ … ]`. Elements can be of any type — even mixed types or nested arrays. You can build them from literals or from payload selectors.",
    tutorialUrl: "https://dataweave.mulesoft.com/learn/tutorial/2.4-Arrays",
    script: `%dw 2.0
output application/json
---
{
  empty:        [],
  numbers:      [1, 2, 3, 4, 5],
  strings:      ["red", "green", "blue"],
  mixed:        [1, "two", true, null],
  nested:       [[1, 2], [3, 4], [5, 6]],
  fromPayload:  payload.colors,
  computed:     [payload.x, payload.x * 2, payload.x * 3]
}`,
    payload: { colors: ["red", "amber", "green"], x: 10 },
    annotations: [
      {
        lineRange: [1, 3],
        title: "Standard header",
        body: "Header + separator. Lesson body starts below.",
      },
      {
        lineRange: [5, 5],
        title: "Empty array",
        body: "`[]` is a zero-element array. Useful as a default or starting point.",
      },
      {
        lineRange: [6, 7],
        title: "Homogeneous arrays",
        body: "Most arrays hold one type of value. Comma-separated, wrapped in `[ … ]`.",
      },
      {
        lineRange: [8, 8],
        title: "Mixed-type arrays are allowed",
        body: "DataWeave doesn't force one type per array — `[1, \"two\", true, null]` is valid. Useful for ad-hoc tuples; real-world arrays usually stay homogeneous.",
      },
      {
        lineRange: [9, 9],
        title: "Nested arrays",
        body: "Elements can themselves be arrays. `[[1,2], [3,4]]` is a 2-D array.",
      },
      {
        lineRange: [10, 10],
        title: "Arrays from the payload",
        body: "Selectors return whatever's at that path. If it's an array, you get an array back. We'll cover selectors more in Chapter 3.",
      },
      {
        lineRange: [11, 11],
        title: "Computed elements",
        body: "Each element is an *expression*, not just a literal. You can call functions, do arithmetic, or reference vars — anything that evaluates to a value.",
      },
    ],
  },

  {
    id: "2.5-objects",
    chapter: "2.5",
    title: "Objects",
    description:
      "Objects are unordered (in concept; ordered in practice) collections of key-value pairs wrapped in `{ … }`. Keys are usually identifiers but can be quoted strings; values are any expression.",
    tutorialUrl: "https://dataweave.mulesoft.com/learn/tutorial/2.5-Objects",
    script: `%dw 2.0
output application/json
---
{
  empty:       {},
  simple:      { name: "Coffee", price: 4.5 },
  quotedKeys:  { "first name": "Alice", "last name": "Smith" },
  nested:      { user: { name: "Bob", age: 30 } },
  computed:    { sum: 1 + 2, greeting: "Hi" ++ "!" },
  fromPayload: payload.user
}`,
    payload: { user: { name: "Carol", email: "c@example.com" } },
    annotations: [
      {
        lineRange: [1, 3],
        title: "Standard header",
        body: "Header + separator. Lesson body starts below.",
      },
      {
        lineRange: [5, 5],
        title: "Empty object",
        body: "`{}` is an object with no fields. Often a default before you decide what to put in it.",
      },
      {
        lineRange: [6, 6],
        title: "Simple key-value pairs",
        body: "`{ key: value, key: value }`. Keys that look like identifiers (letters / digits / underscore, no leading digit) can be bare.",
      },
      {
        lineRange: [7, 7],
        title: "Keys with spaces or special characters",
        body: "Wrap such keys in double quotes: `{ \"first name\": \"Alice\" }`. The quoted form is also fine for any key — `\"name\"` works equally to `name`.",
      },
      {
        lineRange: [8, 8],
        title: "Nested objects",
        body: "Values can themselves be objects. There's no depth limit.",
      },
      {
        lineRange: [9, 9],
        title: "Computed values",
        body: "Each value is an *expression*. You can do arithmetic, concatenate strings, call functions, reference vars or payload — anything that produces a value.",
      },
      {
        lineRange: [10, 10],
        title: "Objects from the payload",
        body: "Just like arrays — a selector returns whatever shape is at that path. Here `payload.user` brings back the whole sub-object.",
      },
    ],
  },

  // ─── Chapter 3: Reading Data (selectors) ───────────────────────────────
  {
    id: "3.1-single-value-selector",
    chapter: "3.1",
    title: "Single Value Selector",
    description:
      "The dot selector `.fieldName` reads one field from an object. Chain dots to walk into nested structures. Selectors are null-safe: if any step is missing, the whole expression returns `null` instead of throwing.",
    tutorialUrl: "https://dataweave.mulesoft.com/learn/tutorial/3.1-Single_Value_Selector",
    script: `%dw 2.0
output application/json
---
{
  name:          payload.user.name,
  city:          payload.user.address.city,
  missing:       payload.user.middleName,
  deepMissing:   payload.does.not.exist,
  topLevel:      payload.tag
}`,
    payload: {
      user: {
        name: "Alice",
        address: { city: "Berlin", zip: "10115" },
      },
      tag: "vip",
    },
    annotations: [
      {
        lineRange: [1, 3],
        title: "Standard header",
        body: "Header + separator. The body below is one big object that demonstrates selector behaviour.",
      },
      {
        lineRange: [5, 5],
        title: "Reading one level deep",
        body: "`payload.user.name` walks: start at `payload`, then read field `user`, then field `name`. Returns the value at that path.",
      },
      {
        lineRange: [6, 6],
        title: "Chained selectors",
        body: "No limit on chain length. `payload.user.address.city` walks three levels.",
      },
      {
        lineRange: [7, 7],
        title: "Missing fields → null",
        body: "If a field doesn't exist, the result is `null`. **No exception is thrown** — this is one of DataWeave's friendlier choices.",
      },
      {
        lineRange: [8, 8],
        title: "Null-safe propagation",
        body: "Even if an intermediate step is missing, the chain doesn't blow up. `payload.does.not.exist` walks until it hits a missing field, then returns `null`.",
      },
      {
        lineRange: [9, 9],
        title: "Top-level fields",
        body: "`payload.tag` reads a direct child of the payload root. Same syntax, just one step.",
      },
    ],
  },

  {
    id: "3.2-index-selector",
    chapter: "3.2",
    title: "Index Selector",
    description:
      "Use `[n]` to pick the n-th element. Negative indices count from the end. Out-of-bounds is `null` (not an error). Works on arrays, strings, and objects.",
    tutorialUrl: "https://dataweave.mulesoft.com/learn/tutorial/3.2-Index_Selector",
    script: `%dw 2.0
output application/json
---
{
  first:        payload.users[0],
  last:         payload.users[-1],
  middle:       payload.users[1],
  outOfBounds:  payload.users[99],
  firstChar:    payload.greeting[0],
  firstValue:   payload.scores[0]
}`,
    payload: {
      users: ["alice", "bob", "carol"],
      greeting: "hello",
      scores: { a: 10, b: 20, c: 30 },
    },
    annotations: [
      {
        lineRange: [1, 3],
        title: "Standard header",
        body: "Header + separator. Body uses the index selector.",
      },
      {
        lineRange: [5, 5],
        title: "First element",
        body: "`payload.users[0]` reads the element at position 0. Indices start at zero — the first item is `[0]`, not `[1]`.",
      },
      {
        lineRange: [6, 6],
        title: "Last element via negative index",
        body: "`[-1]` counts back from the end. `payload.users[-1]` is the last user, regardless of length.",
      },
      {
        lineRange: [7, 7],
        title: "Any position you want",
        body: "Any integer expression works. Here `[1]` returns the middle element.",
      },
      {
        lineRange: [8, 8],
        title: "Out-of-bounds → null",
        body: "If the index is past the end of the array, the result is `null` — no error. Friendly default for unreliable input.",
      },
      {
        lineRange: [9, 9],
        title: "Strings are indexable too",
        body: "`\"hello\"[0]` returns `\"h\"`. Strings work like arrays of characters for indexing.",
      },
      {
        lineRange: [10, 10],
        title: "Objects: by entry position",
        body: "Indexing an object by integer returns the value at the n-th entry. `{a:10, b:20, c:30}[0]` returns `10` — the value of the first key/value pair.",
      },
    ],
  },

  {
    id: "3.3-range-selector",
    chapter: "3.3",
    title: "Range Selector",
    description:
      "`[n to m]` returns a slice — every element from index `n` to index `m`, inclusive. Negative indices count from the end. If the range is reversed (start > end), you get an empty slice rather than an error.",
    tutorialUrl: "https://dataweave.mulesoft.com/learn/tutorial/3.3-Range_Selector",
    script: `%dw 2.0
output application/json
---
{
  firstThree:  payload[0 to 2],
  middle:      payload[2 to 4],
  lastTwo:     payload[-2 to -1],
  reversed:    payload[3 to 1],
  wholeArray:  payload[0 to -1],
  stringSlice: "DataWeave"[0 to 3]
}`,
    payload: [10, 20, 30, 40, 50, 60],
    annotations: [
      {
        lineRange: [1, 3],
        title: "Standard header",
        body: "Header + separator. The payload is a 6-element array; the body slices it different ways.",
      },
      {
        lineRange: [5, 5],
        title: "Basic range — inclusive on both ends",
        body: "`payload[0 to 2]` returns indices 0, 1, **and** 2. That's three elements. Note this differs from JS / Python: DataWeave's range is **inclusive of the end**.",
      },
      {
        lineRange: [6, 6],
        title: "Slice in the middle",
        body: "Same shape, just shifted. `[2 to 4]` returns three elements starting at index 2.",
      },
      {
        lineRange: [7, 7],
        title: "Negative indices",
        body: "`-1` is the last element, `-2` the second-last. So `[-2 to -1]` gives you the trailing two.",
      },
      {
        lineRange: [8, 8],
        title: "Reversed range → reversed slice",
        body: "When start > end, DataWeave **reverses** the slice. `payload[3 to 1]` returns the elements at indices 3, 2, 1 — in that order. Works on strings too: `\"DataWeave\"[3 to 0]` is `\"ataD\"`.",
      },
      {
        lineRange: [9, 9],
        title: "Whole array trick",
        body: "`[0 to -1]` returns the whole array. Combines a fixed start with a negative end so it works regardless of length.",
      },
      {
        lineRange: [10, 10],
        title: "Works on strings too",
        body: "`\"DataWeave\"[0 to 3]` returns `\"Data\"`. Strings are sliced the same way — start to end inclusive.",
      },
    ],
  },

  {
    id: "3.4-multi-value-selector",
    chapter: "3.4",
    title: "Multi Value Selector",
    description:
      "`obj.*field` collects **every** value at the given field. On a JSON array of objects it's essentially `arr map (x) -> x.field` — handy for pulling a single column out of records. On a single object, JSON keys are unique so you get a one-element array.",
    tutorialUrl: "https://dataweave.mulesoft.com/learn/tutorial/3.4-Multi_Value_Selector",
    script: `%dw 2.0
output application/json
---
{
  allUserNames:  payload.users.*name,
  allRoles:      payload.users.*role,
  singleObject:  payload.shipping.*city,
  missingField:  payload.users.*nope
}`,
    payload: {
      users: [
        { name: "Alice", role: "admin" },
        { name: "Bob",   role: "user" },
        { name: "Carol", role: "user" },
      ],
      shipping: { city: "Berlin", zip: "10115" },
    },
    annotations: [
      {
        lineRange: [1, 3],
        title: "Standard header",
        body: "Header + separator. The payload has an array of users and a shipping object — both will be queried with `.*`.",
      },
      {
        lineRange: [5, 6],
        title: "Pulling a column from an array of objects",
        body: "`payload.users.*name` returns `[\"Alice\", \"Bob\", \"Carol\"]` — the `name` field from each element of the array. Think of it as a quick projection without writing a full `map`.",
      },
      {
        lineRange: [7, 7],
        title: "On a single object",
        body: "`payload.shipping.*city` returns `[\"Berlin\"]` — a singleton array. JSON keys are unique, so there's at most one match. In real DataWeave with **XML** input, multi-valued objects are common (think repeated `<item>` elements) and this selector shines.",
      },
      {
        lineRange: [8, 8],
        title: "No matches → null",
        body: "If no element has that field, the result is `null` (not an empty array). Useful for branching: `payload.users.*nope default []` gives you a safe fallback.",
      },
    ],
  },

  {
    id: "3.5-descendants-selector",
    chapter: "3.5",
    title: "Descendants Selector",
    description:
      "`obj..field` walks the **entire tree** rooted at `obj` and returns every value sitting at a field with that name, no matter how deep. Useful for hunting through nested payloads without writing a recursive function.",
    tutorialUrl: "https://dataweave.mulesoft.com/learn/tutorial/3.5-Descendants_Selector",
    script: `%dw 2.0
output application/json
---
{
  allIds:    payload..id,
  allNames:  payload..name,
  noMatch:   payload..nonexistent
}`,
    payload: {
      id: 1,
      name: "root",
      child: {
        id: 2,
        name: "branch",
        leaf: { id: 3, name: "leaf-a" },
      },
      siblings: [
        { id: 4, name: "leaf-b" },
        { id: 5, name: "leaf-c" },
      ],
    },
    annotations: [
      {
        lineRange: [1, 3],
        title: "Standard header",
        body: "Header + separator. The payload is a tree of objects with `id` and `name` fields scattered at multiple depths.",
      },
      {
        lineRange: [5, 5],
        title: "Find every `id` in the tree",
        body: "`payload..id` returns **all five** `id` values, in tree-traversal order: root, child, leaf, then array elements. No matter how deep the field sits, it's collected.",
      },
      {
        lineRange: [6, 6],
        title: "Different field, same walk",
        body: "Swap `..id` for `..name` to gather every `name` in the tree. Same five-element result, different field.",
      },
      {
        lineRange: [7, 7],
        title: "No matches → null",
        body: "If nothing in the tree has that field, you get `null`. Same convention as the multi-value selector — `null` signals \"nothing found\", an empty array signals \"the field exists but contained no entries to collect\".",
      },
    ],
  },

  // ─── Chapter 4: Variables & Logical Operators ──────────────────────────
  {
    id: "4.1-variable-access",
    chapter: "4.1",
    title: "Variable Access",
    description:
      "`var name = expr` binds a value in the header that the body can use by name. Vars are evaluated in declaration order, and once bound stay available for everything below.",
    tutorialUrl: "https://dataweave.mulesoft.com/learn/tutorial/4.1-Variable_Access",
    script: `%dw 2.0
output application/json
var pi = 3.14159
var name = payload.customer.name
var subtotal = payload.price * payload.qty
var taxRate = 0.1
---
{
  greeting:   "Hello, " ++ name ++ "!",
  area:       pi * payload.radius * payload.radius,
  subtotal:   subtotal,
  tax:        subtotal * taxRate,
  total:      subtotal + (subtotal * taxRate)
}`,
    payload: {
      customer: { name: "Dana" },
      radius: 5,
      price: 4.5,
      qty: 3,
    },
    annotations: [
      {
        lineRange: [1, 2],
        title: "%dw + output",
        body: "Standard directives. Vars come next.",
      },
      {
        lineRange: [3, 3],
        title: "A literal var",
        body: "`var pi = 3.14159` binds a constant. The expression on the right can be any value — literals, payload selectors, arithmetic.",
      },
      {
        lineRange: [4, 4],
        title: "A var that uses payload",
        body: "Vars can reference `payload`. The result is captured once, when the var is evaluated, and stays available for the whole body.",
      },
      {
        lineRange: [5, 5],
        title: "A computed var",
        body: "`subtotal = payload.price * payload.qty` runs arithmetic at declaration time. Note `subtotal` can reference `payload` but not `taxRate` (yet) — vars are evaluated **top-down**.",
      },
      {
        lineRange: [6, 6],
        title: "Order matters",
        body: "`taxRate` is declared **after** `subtotal`. If `subtotal` had tried to use `taxRate`, that would be an error: a var can only reference others declared **above** it.",
      },
      {
        lineRange: [7, 7],
        title: "Separator",
        body: "End of header. Vars are now all bound — the body below can use any of them.",
      },
      {
        lineRange: [8, 14],
        title: "Body uses vars by name",
        body: "In the body, just write the var's name to use its value. You can also still reference `payload` directly. Vars and payload coexist.",
      },
    ],
  },

  {
    id: "4.2-logical-operators",
    chapter: "4.2",
    title: "Logical Operators",
    description:
      "`and`, `or`, `not` combine booleans. `and` and `or` **short-circuit**: if the left side already determines the answer, the right side is never evaluated. `not` flips truth. Precedence: `not` binds tightest, then `and`, then `or`.",
    tutorialUrl: "https://dataweave.mulesoft.com/learn/tutorial/4.2-Logical_Operators",
    script: `%dw 2.0
output application/json
var age = payload.age
var isStudent = payload.isStudent
---
{
  bothTrue:       age >= 18 and isStudent,
  eitherTrue:     age < 18 or isStudent,
  flipped:        not isStudent,
  combined:       not (age < 18) and isStudent,
  shortCircuitOr: true or payload.doesNotExist.nope,
  shortCircuitAnd: false and payload.doesNotExist.nope,
  precedence:     true or false and false
}`,
    payload: { age: 21, isStudent: true },
    annotations: [
      {
        lineRange: [1, 5],
        title: "Header + vars",
        body: "Two vars from payload set up the lesson: `age` (a number) and `isStudent` (a boolean).",
      },
      {
        lineRange: [7, 7],
        title: "`and` — both must be truthy",
        body: "`age >= 18 and isStudent` is `true` only when **both** sides are. Useful for gating decisions on multiple conditions.",
      },
      {
        lineRange: [8, 8],
        title: "`or` — at least one truthy",
        body: "`age < 18 or isStudent` is `true` if **either** side is. The right side isn't checked if the left is already truthy (short-circuit).",
      },
      {
        lineRange: [9, 9],
        title: "`not` — flip truth",
        body: "Unary prefix. `not true → false`, `not false → true`. Binds tighter than `and` / `or`.",
      },
      {
        lineRange: [10, 10],
        title: "Mix with parens",
        body: "`not (age < 18) and isStudent` reads as: \"age is **not** under 18, **and** they're a student.\" Parens force `not` to apply to the whole comparison.",
      },
      {
        lineRange: [11, 11],
        title: "Short-circuit `or`",
        body: "The left side is `true`, so DataWeave returns `true` **without** evaluating the right side — which is why `payload.doesNotExist.nope` doesn't blow up here. Watch the step trace: you'll see the short-circuit annotation.",
      },
      {
        lineRange: [12, 12],
        title: "Short-circuit `and`",
        body: "Mirror image. Left is `false`, so `and` returns `false` immediately and skips the right side. Same safety net.",
      },
      {
        lineRange: [13, 13],
        title: "Precedence: `and` tighter than `or`",
        body: "`true or false and false` parses as `true or (false and false)`. `and` binds tighter, so it groups first. Result: `true`.",
      },
    ],
  },

  // ─── Free-form playground samples ──────────────────────────────────────
  {
    id: "intro-receipt",
    chapter: "Recipe",
    title: "Receipt: compute tax & total",
    description:
      "A small free-form example. Edit the script and input freely — there are no annotations, just the evaluation trace.",
    tutorialUrl: null,
    script: `%dw 2.0
output application/json
var tax = 0.1
var subtotal = payload.price * payload.qty
---
{
  item: payload.name,
  subtotal: subtotal,
  tax: subtotal * tax,
  total: subtotal + (subtotal * tax),
  message: "Receipt for " ++ payload.name
}`,
    payload: { name: "Coffee", price: 4.5, qty: 3 },
  },

];

export const SAMPLES_BY_ID = Object.fromEntries(SAMPLES.map((s) => [s.id, s]));
