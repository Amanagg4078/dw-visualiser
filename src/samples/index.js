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

  // ─── Chapter 5: Flow Control ────────────────────────────────────────────
  {
    id: "5.1-if-else",
    chapter: "5.1",
    title: "If / Else",
    description:
      "`if (cond) thenExpr else elseExpr` is a regular **expression** — it returns a value, so you can put it anywhere a value goes (inside an object field, as a var initializer, even as a function argument). Both arms are required; only the taken arm is evaluated.",
    tutorialUrl: "https://dataweave.mulesoft.com/learn/tutorial/5.1-If_Else",
    script: `%dw 2.0
output application/json
var age = payload.age
---
{
  status:     if (age >= 18) "adult" else "minor",
  drinkAge:   if (age >= 21) "yes" else "no",
  scale:      if (payload.score > 90) "excellent"
              else if (payload.score > 70) "good"
              else "needs work",
  nameOrAnon: if (payload.name != null) payload.name else "anonymous",
  inField:    { kind: if (age >= 18) "ok" else "blocked" }
}`,
    payload: { age: 21, score: 85, name: "Alice" },
    annotations: [
      {
        lineRange: [1, 4],
        title: "Header + the condition input",
        body: "We bind `age` from payload — vars work just like before. The body uses `age` and a few other payload fields to demonstrate branching.",
      },
      {
        lineRange: [6, 6],
        title: "Basic `if (cond) X else Y`",
        body: "Parens around the condition are required. **Both branches are required** — DataWeave's `if` is an expression that always produces a value, never a statement.",
      },
      {
        lineRange: [7, 7],
        title: "Comparison operators feed the condition",
        body: "Anything that produces a boolean works: `==`, `!=`, `<`, `>`, `<=`, `>=`, `and`/`or`/`not`, or a function returning a Bool.",
      },
      {
        lineRange: [8, 10],
        title: "Chained `else if`",
        body: "There's no special `elif`/`elsif` syntax — chains are just an `if` nested inside the else arm. The engine parses this exactly as `if (...) … else (if (...) … else …)`.",
      },
      {
        lineRange: [11, 11],
        title: "Fallback for nullable payloads",
        body: "`if (x != null) x else default` is a common idiom. (DataWeave also has a dedicated `default` operator we'll cover later.)",
      },
      {
        lineRange: [12, 12],
        title: "`if` is an expression — it lives inside other expressions",
        body: "Because `if` returns a value, you can put it directly inside an object literal, an array element, or a function argument. No wrapping needed.",
      },
    ],
  },

  {
    id: "5.2-literal-pattern-matching",
    chapter: "5.2",
    title: "Literal Pattern Matching",
    description:
      "`<expr> match { case <lit> -> <result> ... else -> <fallback> }` is a multi-way conditional. Each case compares the subject against a literal; the first matching case's result becomes the value of the whole expression. If none match, the `else` (or trailing `case ->`) fallback runs. Like `if/else`, `match` is an **expression** — its value can be assigned, nested, returned anywhere.",
    tutorialUrl: "https://dataweave.mulesoft.com/learn/tutorial/5.2-Literal_Pattern_Matching",
    script: `%dw 2.0
output application/json
---
{
  action: payload.action match {
    case "buy"  -> "Buy at market price"
    case "sell" -> "Sell at market price"
    case "hold" -> "Hold the asset"
    else        -> "Invalid action"
  },
  numeric: payload.status match {
    case 0 -> "off"
    case 1 -> "on"
    else   -> "unknown"
  },
  noFallback: payload.flag match {
    case true -> "yes"
  }
}`,
    payload: { action: "buy", status: 1, flag: false },
    annotations: [
      {
        lineRange: [1, 3],
        title: "Standard header",
        body: "Header + separator. The body is one object whose values each demonstrate a different match.",
      },
      {
        lineRange: [5, 10],
        title: "Match on strings",
        body: "`payload.action match { case \"buy\" -> … }`. DataWeave evaluates the **subject** once, then walks each case top-to-bottom comparing with strict equality (`==`). First match wins; remaining cases are never evaluated.",
      },
      {
        lineRange: [6, 8],
        title: "One `case` per arm",
        body: "Each `case <literal> -> <result>` is a possible branch. The `<result>` can be any expression — a literal, a payload selector, a function call, even another `match`.",
      },
      {
        lineRange: [9, 9],
        title: "`else -> …` is the fallback",
        body: "Required to cover the \"no case matched\" path. Without it, the match returns `null` when nothing matches (see the third example below).",
      },
      {
        lineRange: [11, 15],
        title: "Match on numbers, booleans — any literal type",
        body: "`case 0 ->`, `case true ->`, `case \"hi\" ->` all work the same way. Equality is strict and typed: `1 == \"1\"` is `false`, so `case 1 ->` won't match a payload value of `\"1\"`.",
      },
      {
        lineRange: [16, 18],
        title: "Match with no matching case → null",
        body: "When neither a `case` nor an `else` matches, the result is `null`. Useful when `null` is a fine \"unhandled\" sentinel; otherwise add `else -> …`. Real DataWeave tutorial also allows a `case -> <fallback>` form (no literal) which is equivalent to `else -> <fallback>`.",
      },
    ],
  },

  // ─── Chapter 6: Functions ────────────────────────────────────────────────
  {
    id: "6.1-named-functions",
    chapter: "6.1",
    title: "Named Functions",
    description:
      "`fun name(params) = body` declares a reusable function in the header. Functions are evaluated like `var` declarations — same scoping rules, same order. Functions can call themselves (recursion) and can call other functions declared before them.",
    tutorialUrl: "https://dataweave.mulesoft.com/learn/tutorial/6.1-Named_functions",
    script: `%dw 2.0
output application/json
fun double(x) = x * 2
fun greet(name) = "Hello, " ++ name ++ "!"
fun area(width, height) = width * height
fun fact(n) = if (n <= 1) 1 else n * fact(n - 1)
---
{
  doubled:   double(21),
  greeted:   greet(payload.name),
  rectangle: area(payload.w, payload.h),
  factorial: fact(payload.n)
}`,
    payload: { name: "Aman", w: 4, h: 5, n: 5 },
    annotations: [
      {
        lineRange: [1, 2],
        title: "Standard header",
        body: "`%dw` + `output`. Functions come next.",
      },
      {
        lineRange: [3, 3],
        title: "Simplest function: one param, one expression",
        body: "`fun double(x) = x * 2`. Everything after the `=` is the body — a single expression. **No `return`, no braces.** The whole expression's value is the return value.",
      },
      {
        lineRange: [4, 4],
        title: "Functions use everything you already know",
        body: "Body is just an expression. You can use `++` for string concat, payload selectors, arithmetic — same vocabulary as the body of any script.",
      },
      {
        lineRange: [5, 5],
        title: "Multiple parameters",
        body: "Comma-separated. Position-bound: `area(4, 5)` means `width = 4`, `height = 5`.",
      },
      {
        lineRange: [6, 6],
        title: "Recursion works",
        body: "A function can call itself. `fact` uses an `if` to terminate, multiplying by the recursive call. Step through `fact(5)` to watch the call frames push and pop.",
      },
      {
        lineRange: [7, 7],
        title: "Separator",
        body: "End of header. The body below is where the functions get called.",
      },
      {
        lineRange: [8, 13],
        title: "Calling functions: `name(args)`",
        body: "Same shape as math: function name, then comma-separated args in parens. Each call evaluates the args, pushes a new scope frame with params bound, and runs the body — exactly what `area(4, 5)` does here.",
      },
    ],
  },

  {
    id: "6.2-lambdas",
    chapter: "6.2",
    title: "Lambdas",
    description:
      "A lambda is an anonymous function: `(params) -> body`. Same shape as `fun`, just no name — useful for one-off transformations or passing into other functions. Lambdas **close over their surrounding scope** — they capture vars in scope at the point they're defined.",
    tutorialUrl: "https://dataweave.mulesoft.com/learn/tutorial/6.2-Lambdas",
    script: `%dw 2.0
output application/json
var pi = 3.14159
var inc = (x) -> x + 1
var add = (a, b) -> a + b
var ringArea = (r) -> pi * r * r
var greet = () -> "Hello, World!"
---
{
  one:        inc(0),
  two:        inc(inc(0)),
  sum:        add(payload.a, payload.b),
  area:       ringArea(payload.radius),
  hello:      greet()
}`,
    payload: { a: 10, b: 32, radius: 5 },
    annotations: [
      {
        lineRange: [1, 2],
        title: "Header",
        body: "`%dw` + `output`. The lesson uses several vars holding lambdas.",
      },
      {
        lineRange: [3, 3],
        title: "A regular var, for reference",
        body: "`pi` is just a number, declared with `var`. The next line shows the *shape difference* between a value var and a function var.",
      },
      {
        lineRange: [4, 4],
        title: "Anonymous function syntax: `(params) -> body`",
        body: "`(x) -> x + 1` is a function with one parameter and one expression as the body. It's a *value* — assigned to a var like any other.",
      },
      {
        lineRange: [5, 5],
        title: "Multiple parameters",
        body: "Comma-separated, exactly like `fun`. Lambdas and named functions are interchangeable; `fun foo(x) = x + 1` is sugar for `var foo = (x) -> x + 1`.",
      },
      {
        lineRange: [6, 6],
        title: "Closures: capture surrounding scope",
        body: "`ringArea` references `pi`, which is declared in the outer scope. The lambda **closes over** that — even if `pi` were used in a much deeper context, the lambda would still see it. Step into a call to watch the scope panel show both `pi` and `r`.",
      },
      {
        lineRange: [7, 7],
        title: "Zero-arg lambdas are valid",
        body: "`() -> \"Hello, World!\"` is a function that takes no arguments. Call it as `greet()`.",
      },
      {
        lineRange: [8, 14],
        title: "Calling lambdas",
        body: "Same syntax as named functions: `varName(args)`. There's no real distinction at call site — both are just function values.",
      },
    ],
  },

  {
    id: "6.3-function-as-value",
    chapter: "6.3",
    title: "Function as Value",
    description:
      "Functions are **first-class** in DataWeave: you can pass them as arguments, return them from other functions, and store them in vars or object fields. This is the foundation for `map`, `filter`, `reduce`, and every other array transformation you'll meet in Chapter 7.",
    tutorialUrl: "https://dataweave.mulesoft.com/learn/tutorial/6.3-Function_as_value",
    script: `%dw 2.0
output application/json
var inc = (x) -> x + 1
var dbl = (x) -> x * 2

// A higher-order function: takes another function and a value.
fun applyTwice(f, x) = f(f(x))

// A function that returns a function.
fun makeAdder(n) = (x) -> x + n

var addFive = makeAdder(5)
---
{
  twiceInc:     applyTwice(inc, 10),
  twiceDbl:     applyTwice(dbl, 3),
  pickedFn:     (if (payload.op == "inc") inc else dbl)(payload.n),
  closureAdd:   addFive(100),
  stillWorks:   addFive(addFive(0))
}`,
    payload: { op: "inc", n: 7 },
    annotations: [
      {
        lineRange: [1, 5],
        title: "Two lambdas to use as arguments",
        body: "`inc` and `dbl` are just function values stored in vars. Nothing special — yet.",
      },
      {
        lineRange: [6, 7],
        title: "Higher-order function: a function that takes a function",
        body: "`applyTwice(f, x)` calls `f(f(x))` — runs `f` on `x` twice. The first parameter is *any* function. This is the pattern `map` / `filter` / `reduce` use under the hood.",
      },
      {
        lineRange: [9, 10],
        title: "Function that returns a function",
        body: "`makeAdder(5)` returns a brand-new function `(x) -> x + 5`. The returned function **captures** `n = 5` from `makeAdder`'s frame — that's a closure in action.",
      },
      {
        lineRange: [11, 11],
        title: "Storing a captured function",
        body: "`addFive` is now a function value — the one that adds 5. The frame in which `n` was 5 is kept alive *only* because `addFive` references it.",
      },
      {
        lineRange: [12, 12],
        title: "Separator",
        body: "Body starts below.",
      },
      {
        lineRange: [13, 14],
        title: "Passing a function as an argument",
        body: "`applyTwice(inc, 10)` passes `inc` itself — the function value, not its result. `applyTwice` then calls it twice: `inc(inc(10))` → `12`.",
      },
      {
        lineRange: [15, 15],
        title: "Choosing a function dynamically",
        body: "An `if`-expression that evaluates to a function value, then calls it. `(if (payload.op == \"inc\") inc else dbl)(payload.n)` picks which function to apply at runtime.",
      },
      {
        lineRange: [16, 17],
        title: "Closures keep their captured state",
        body: "Every call to `addFive` still sees the original `n = 5`. Closures are independent — `makeAdder(10)` would return a different function with its own captured `n = 10`.",
      },
    ],
  },

  {
    id: "6.4-infix-notation",
    chapter: "6.4",
    title: "Infix Notation",
    description:
      "Any two-argument function can be called in **infix** position: `arg1 fnName arg2` is exactly the same as `fnName(arg1, arg2)`. It reads more like English and chains cleanly. (The tutorial uses `filter` for the examples; we'll revisit those once Chapter 7 ships. For now we demonstrate the syntax with hand-rolled helpers.)",
    tutorialUrl: "https://dataweave.mulesoft.com/learn/tutorial/6.4-Infix_notation",
    script: `%dw 2.0
output application/json
fun add(a, b) = a + b
fun applyTo(arg, f) = f(arg)
---
{
  prefix:    add(2, 3),
  infix:     2 add 3,
  chained:   10 applyTo ((x) -> x + 1) applyTo ((x) -> x * 2),
  withLogic: payload.score applyTo ((s) -> if (s >= 80) "pass" else "fail")
}`,
    payload: { score: 85 },
    annotations: [
      {
        lineRange: [1, 4],
        title: "Header + two helpers",
        body: "`add(a, b)` is a plain binary function. `applyTo(arg, f)` is a one-shot higher-order helper — passes `arg` into `f`. Both are eligible for infix calls.",
      },
      {
        lineRange: [6, 6],
        title: "Standard prefix call",
        body: "`add(2, 3)` — the way you've been calling functions all along. Reads function-first.",
      },
      {
        lineRange: [7, 7],
        title: "Infix call — same function, different shape",
        body: "`2 add 3` is **identical** to `add(2, 3)`. The function name sits *between* its two arguments. It's pure syntax sugar — same `Call` AST node, same evaluation.",
      },
      {
        lineRange: [8, 8],
        title: "Chained infix is left-associative",
        body: "`10 applyTo A applyTo B` parses as `(10 applyTo A) applyTo B` — apply `A` to 10, then apply `B` to the result. Reads naturally left-to-right, like a pipeline.",
      },
      {
        lineRange: [9, 9],
        title: "Infix mixes with everything else",
        body: "The second argument is any expression — here a lambda containing an `if/else`. Parens around the lambda are important so the parser knows where it ends.",
      },
    ],
  },

  {
    id: "6.5-dollar-syntax",
    chapter: "6.5",
    title: "`$`, `$$`, `$$$` Implicit Params",
    description:
      "When a function argument uses `$` (or `$$`, `$$$`), it's automatically wrapped as a lambda whose params are positional: `$` is the first param, `$$` the second, `$$$` the third. Lets you write tiny one-shot lambdas without naming the params at all.",
    tutorialUrl: "https://dataweave.mulesoft.com/learn/tutorial/6.5-$,-$$,-$$$-syntax",
    script: `%dw 2.0
output application/json
fun applyTo(arg, f) = f(arg)
fun combine(a, b, f) = f(a, b)
fun triple(a, b, c, f) = f(a, b, c)
---
{
  doubled:    10 applyTo ($ * 2),
  fieldOnly:  payload applyTo $.name,
  added:      combine(2, 3, $ + $$),
  product:    triple(2, 3, 4, $ * $$ * $$$),
  explicit:   10 applyTo ((x) -> x + 100)
}`,
    payload: { name: "Aman" },
    annotations: [
      {
        lineRange: [1, 5],
        title: "Header + helpers (taking 1, 2, 3 args)",
        body: "Three small higher-order helpers — each takes a function with a different arity. The lessons below show how `$`, `$$`, `$$$` line up with first, second, third params.",
      },
      {
        lineRange: [7, 7],
        title: "`$` = the first (and only) param",
        body: "`10 applyTo ($ * 2)` is shorthand for `10 applyTo (($) -> $ * 2)`, which is the same as `applyTo(10, ($) -> $ * 2)`. The parser sees `$` in the arg, auto-wraps it as a one-param lambda. Result: `20`.",
      },
      {
        lineRange: [8, 8],
        title: "`$` works with selectors and other operators",
        body: "`$.name` reaches into the implicit lambda's argument. `payload applyTo $.name` returns `payload.name`. You can do `$ + 1`, `$ > 5`, `$ ++ \"x\"` — anything that uses `$` becomes a lambda body.",
      },
      {
        lineRange: [9, 9],
        title: "`$$` is the second param",
        body: "`combine(2, 3, $ + $$)` auto-wraps as `combine(2, 3, ($, $$) -> $ + $$)`. The parser detects that the highest dollar used is `$$`, so it makes a two-param lambda. Result: `5`.",
      },
      {
        lineRange: [10, 10],
        title: "`$$$` is the third — same pattern scales",
        body: "Three params, three dollars. Beyond three, you'd switch to explicit `(a, b, c, d) -> …` syntax.",
      },
      {
        lineRange: [11, 11],
        title: "Explicit lambdas still work, of course",
        body: "If you'd rather name the params, just write `(x) -> x + 100`. The `$` form is a convenience, not a replacement.",
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
