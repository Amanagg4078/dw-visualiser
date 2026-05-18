import { TOK } from "./lexer.js";

// Built-in higher-order functions for which `$ / $$ / $$$` implicit-lambda
// auto-wrapping is enabled. Real DataWeave only allows the dollar-sign
// syntax for "functions DataWeave provides" (per the official 6.5 lesson),
// not arbitrary user-defined HOFs. Extend this set when we add more
// built-ins (Chapter 7 stdlib).
const KNOWN_HOFS = new Set([
  "filter", "map", "reduce",
  "filterObject", "mapObject", "pluck",
  "distinctBy", "groupBy", "orderBy",
  "sumBy", "avgBy", "maxBy", "minBy",
  "flatMap",
]);

// Note: `update` and `at` are *contextual* keywords — recognised by string
// comparison inside the parser (parseExpr / parseUpdateTail) rather than as
// dedicated lexer tokens. That keeps them as valid identifiers everywhere
// else (`var update = 1`, `obj.at`, etc.).

// Tokens whose source text is a valid identifier even though they're
// reserved as keywords elsewhere. Used as field names after `.` and as
// bare object keys — DataWeave treats these as "soft" keywords.
function isFieldNameToken(type) {
  return type === TOK.IDENT
    || type === TOK.AND   || type === TOK.OR    || type === TOK.NOT
    || type === TOK.VAR   || type === TOK.OUTPUT
    || type === TOK.IF    || type === TOK.ELSE  || type === TOK.FUN
    || type === TOK.MATCH || type === TOK.CASE;
}

// Grammar (informal):
//   Script    := Header SEPARATOR Expr
//   Header    := (DwDirective | OutputDecl | VarDecl | FunDecl)*  // any order, all optional
//   VarDecl   := 'var' IDENT '=' Expr
//   FunDecl   := 'fun' IDENT '(' Params? ')' '=' Expr
//   Params    := IDENT (',' IDENT)*
//   Expr      := IfElse | (Infix MatchTail?)
//   IfElse    := 'if' '(' Expr ')' Expr 'else' Expr
//   MatchTail := 'match' '{' (Case)+ Fallback? '}'
//   Case      := 'case' Expr '->' Expr
//   Fallback  := ('else' | 'case') '->' Expr        // both forms accepted
//   Infix     := Or (IDENT Or)*                     // `a fn b` ≡ `fn(a, b)`, left-assoc
//   Or        := And ('or' And)*
//   And       := LogicalNot ('and' LogicalNot)*
//   LogicalNot:= 'not' LogicalNot | Equality
//   Equality  := Compare (('=='|'!=') Compare)*
//   Compare   := Concat (('<'|'>'|'<='|'>=') Concat)*
//   Concat    := Additive (('++') Additive)*
//   Additive  := Mult (('+'|'-') Mult)*
//   Mult      := Unary (('*'|'/') Unary)*
//   Unary     := '-' Unary | Postfix
//   Postfix   := Primary ( '.' IDENT
//                         | '.*' IDENT
//                         | '..' IDENT
//                         | '[' Expr ('to' Expr)? ']'
//                         | '(' Args? ')'      (function call)
//                         )*
//   Primary   := NUM|STR|BOOL|NULL|IDENT|'('Expr')'|Object|Array|Lambda|$|$$|$$$
//   Lambda    := '(' Params? ')' '->' Expr
export function parse(tokens) {
  let p = 0;
  const peek = () => tokens[p];
  const eat = (type) => {
    const t = tokens[p];
    if (t.type !== type) throw new Error(`Expected ${type} but got ${t.type} (${t.value}) at line ${t.line}:${t.col}`);
    p++;
    return t;
  };

  // Header: %dw, output, and var declarations may appear in any order.
  // %dw is parsed-then-ignored. `output <mime>` records the MIME plus any
  // trailing directive flags (e.g. `skipNullOn = "everywhere"`). Vars are
  // evaluated in declaration order at eval time.
  const header = { vars: [], output: "application/json", skipNullOn: null };
  while (peek().type !== TOK.SEPARATOR && peek().type !== TOK.EOF) {
    const t = peek();
    if (t.type === TOK.DW_DIRECTIVE) {
      p++;
    } else if (t.type === TOK.OUTPUT) {
      p++;
      // MIME is `type` or `type/subtype` — exactly one IDENT, optionally a
      // SLASH + IDENT. Any further IDENT is a directive flag, NOT more mime.
      let mime = "";
      if (peek().type === TOK.IDENT) {
        mime += peek().value;
        p++;
        if (peek().type === TOK.SLASH) {
          mime += peek().value;
          p++;
          if (peek().type === TOK.IDENT) {
            mime += peek().value;
            p++;
          }
        }
      }
      header.output = mime;
      // Optional trailing directive flags: `<name> = <value>`. We only
      // recognise `skipNullOn` today; anything else is parsed and ignored.
      while (peek().type === TOK.IDENT && tokens[p + 1] && tokens[p + 1].type === TOK.ASSIGN) {
        const name = tokens[p++].value;
        p++; // '='
        let value = null;
        if (peek().type === TOK.STR) value = tokens[p++].value;
        else if (peek().type === TOK.IDENT) value = tokens[p++].value;
        else if (peek().type === TOK.BOOL) value = tokens[p++].value;
        if (name === "skipNullOn") header.skipNullOn = value;
      }
    } else if (t.type === TOK.IDENT && t.value === "import") {
      // `import dw::core::Strings` / `import a, b from dw::core::Arrays`
      // Real DW requires these to use stdlib functions like `substring`,
      // `sumBy`, `isString`, etc. We expose them as unqualified built-ins,
      // so the import is a no-op — but we parse it so tutorial-correct
      // scripts validate against our engine too. Consume until newline (we
      // don't track newlines, so consume until the next header keyword,
      // SEPARATOR, or EOF).
      p++;
      while (
        peek().type !== TOK.SEPARATOR &&
        peek().type !== TOK.EOF &&
        peek().type !== TOK.VAR &&
        peek().type !== TOK.FUN &&
        peek().type !== TOK.OUTPUT &&
        peek().type !== TOK.DW_DIRECTIVE &&
        !(peek().type === TOK.IDENT && peek().value === "import")
      ) {
        p++;
      }
    } else if (t.type === TOK.VAR) {
      const tok = eat(TOK.VAR);
      const name = eat(TOK.IDENT).value;
      eat(TOK.ASSIGN);
      const expr = parseExpr();
      header.vars.push({ kind: "VarDecl", name, expr, line: tok.line });
    } else if (t.type === TOK.FUN) {
      // `fun name(params) = body` — sugar for `var name = (params) -> body`.
      // Stored in the same `header.vars` list so evaluation order is preserved.
      // Params may carry default values: `fun f(a, b = 10) = ...`.
      const tok = eat(TOK.FUN);
      const name = eat(TOK.IDENT).value;
      eat(TOK.LPAREN);
      const params = [];
      const paramDefaults = [];
      if (peek().type !== TOK.RPAREN) {
        params.push(eat(TOK.IDENT).value);
        paramDefaults.push(peek().type === TOK.ASSIGN ? (p++, parseExpr()) : null);
        while (peek().type === TOK.COMMA) {
          p++;
          params.push(eat(TOK.IDENT).value);
          paramDefaults.push(peek().type === TOK.ASSIGN ? (p++, parseExpr()) : null);
        }
      }
      eat(TOK.RPAREN);
      eat(TOK.ASSIGN);
      const body = parseExpr();
      const lambda = { kind: "Lambda", params, paramDefaults, body, line: tok.line };
      header.vars.push({ kind: "VarDecl", name, expr: lambda, line: tok.line });
    } else {
      throw new Error(`Unexpected token in header: ${t.type} (${t.value}) at line ${t.line}:${t.col}`);
    }
  }
  eat(TOK.SEPARATOR);
  const body = parseExpr();
  return { kind: "Script", header, body };

  function parseExpr() {
    if (peek().type === TOK.IF) return parseIfElse();
    let head = parseInfix();
    if (peek().type === TOK.MATCH) head = parseMatchTail(head);
    // `update` is a postfix on any expression, like match. Soft-keyword via
    // IDENT === "update".
    if (peek().type === TOK.IDENT && peek().value === "update") head = parseUpdateTail(head);
    return head;
  }
  // `<subject> update { case <bind?> at <path> -> <newExpr>, ... }`
  // Path is a chain starting with `.IDENT` plus optional `[INT]` / further `.IDENT`s.
  function parseUpdateTail(subject) {
    const updateTok = tokens[p++]; // consume the "update" IDENT
    eat(TOK.LBRACE);
    const cases = [];
    while (peek().type !== TOK.RBRACE) {
      let bind = null;
      // Either `case <ident> at <path> -> expr` (with binding) or
      // `case <path> -> expr` (no binding).
      if (peek().type === TOK.CASE) {
        p++;
      } else {
        throw new Error(`Expected 'case' inside update block at line ${peek().line}:${peek().col}`);
      }
      // Lookahead: if next is IDENT followed by "at" (IDENT), it's a binding.
      if (
        peek().type === TOK.IDENT && peek().value !== "at" &&
        tokens[p + 1] && tokens[p + 1].type === TOK.IDENT && tokens[p + 1].value === "at"
      ) {
        bind = tokens[p++].value;
        p++; // consume "at"
      }
      // Parse the path: at least one `.field` step.
      const path = parsePath();
      eat(TOK.ARROW);
      const result = parseExpr();
      cases.push({ bind, path, result });
    }
    eat(TOK.RBRACE);
    return { kind: "UpdateExpr", subject, cases, line: updateTok.line };
  }
  function parsePath() {
    const steps = [];
    if (peek().type !== TOK.DOT) {
      throw new Error(`Expected '.' to start update path at line ${peek().line}:${peek().col}`);
    }
    while (peek().type === TOK.DOT || peek().type === TOK.LBRACK) {
      if (peek().type === TOK.DOT) {
        p++;
        const t = peek();
        if (!isFieldNameToken(t.type)) {
          throw new Error(`Expected field name after '.' in path at line ${t.line}:${t.col}`);
        }
        steps.push({ kind: "field", name: String(t.value) });
        p++;
      } else {
        p++;
        const idx = parseExpr();
        eat(TOK.RBRACK);
        steps.push({ kind: "index", expr: idx });
      }
    }
    return steps;
  }
  function parseIfElse() {
    const tok = eat(TOK.IF);
    eat(TOK.LPAREN);
    const cond = parseExpr();
    eat(TOK.RPAREN);
    const thenExpr = parseExpr();
    eat(TOK.ELSE);
    const elseExpr = parseExpr();
    return { kind: "IfElse", cond, then: thenExpr, else: elseExpr, line: tok.line };
  }
  function parseMatchTail(subject) {
    const tok = eat(TOK.MATCH);
    eat(TOK.LBRACE);
    const cases = [];
    let fallback = null;
    while (peek().type !== TOK.RBRACE) {
      if (peek().type === TOK.CASE) {
        p++;
        // Either `case <literal> -> body` (matched) or `case -> body` (fallback).
        if (peek().type === TOK.ARROW) {
          p++;
          fallback = parseExpr();
        } else {
          const literal = parseExpr();
          eat(TOK.ARROW);
          const result = parseExpr();
          cases.push({ literal, result });
        }
      } else if (peek().type === TOK.ELSE) {
        p++;
        eat(TOK.ARROW);
        fallback = parseExpr();
      } else {
        throw new Error(`Expected 'case' or 'else' in match block at line ${peek().line}:${peek().col}`);
      }
    }
    eat(TOK.RBRACE);
    return { kind: "MatchExpr", subject, cases, fallback, line: tok.line };
  }
  // Infix function calls — `arg1 fnName arg2` ≡ `fnName(arg1, arg2)`. Left-assoc.
  // Sits between IfElse/Match and Or so that `match` keyword (postfix) and
  // logical operators (Or/And) still bind correctly.
  //
  // We exclude *contextual* keywords from infix consideration:
  //   - `to`      used inside `arr[n to m]` (range selector)
  //   - `update`  used after a subject as a postfix operator
  //   - `default` used as a low-precedence null-fallback operator
  // Without these exclusions they'd parse as `to(0, 2)` / `update(payload, …)`
  // / `default(x, y)` function calls and the real syntax would break.
  function parseInfix() {
    let left = parseRange();
    while (
      peek().type === TOK.IDENT &&
      peek().value !== "to" &&
      peek().value !== "update" &&
      peek().value !== "default"
    ) {
      const fnTok = tokens[p++];
      const right = parseRange();
      const callee = { kind: "Ident", name: fnTok.value, line: fnTok.line };
      left = {
        kind: "Call",
        callee,
        args: wrapDollarArgs(callee, [left, right]),
        line: left.line ?? fnTok.line,
      };
    }
    return left;
  }
  // `n to m` — standalone range literal at a precedence rung BELOW infix
  // calls but ABOVE the default/logical/comparison rungs. That ordering
  // makes `0 to item reduce f` parse as `(0 to item) reduce f` (matching
  // real DW), and `0 + 1 to 5 + 1` as `(0+1) to (5+1)`. Non-loop: chained
  // `0 to 5 to 10` is not meaningful, so we only allow a single `to`.
  function parseRange() {
    const left = parseDefault();
    if (peek().type === TOK.IDENT && peek().value === "to") {
      const tok = tokens[p++];
      const right = parseDefault();
      return { kind: "RangeLit", start: left, end: right, line: left.line ?? tok.line };
    }
    return left;
  }
  // `default` — `lhs default rhs` returns rhs when lhs is null/missing.
  // Right-associative so `a default b default c` is `a default (b default c)`.
  // Sits below the infix-call rung so `payload.x map f default []` is read as
  // `(payload.x map f) default []` (left side is the whole map call).
  function parseDefault() {
    const left = parseOr();
    if (peek().type === TOK.IDENT && peek().value === "default") {
      const tok = tokens[p++];
      const right = parseDefault();
      return { kind: "DefaultOp", left, right, line: left.line ?? tok.line };
    }
    return left;
  }
  function parseOr() {
    let left = parseAnd();
    while (peek().type === TOK.OR) {
      const tok = tokens[p++];
      const right = parseAnd();
      left = { kind: "LogicalOp", op: "or", left, right, line: left.line ?? tok.line };
    }
    return left;
  }
  function parseAnd() {
    let left = parseLogicalNot();
    while (peek().type === TOK.AND) {
      const tok = tokens[p++];
      const right = parseLogicalNot();
      left = { kind: "LogicalOp", op: "and", left, right, line: left.line ?? tok.line };
    }
    return left;
  }
  function parseLogicalNot() {
    if (peek().type === TOK.NOT) {
      const tok = tokens[p++];
      return { kind: "LogicalNot", operand: parseLogicalNot(), line: tok.line };
    }
    return parseEquality();
  }
  function parseEquality() {
    let left = parseCompare();
    while (peek().type === TOK.EQ || peek().type === TOK.NEQ || peek().type === TOK.SIMILAR) {
      const op = tokens[p++].value;
      const right = parseCompare();
      left = { kind: "BinOp", op, left, right, line: left.line };
    }
    return left;
  }
  function parseCompare() {
    let left = parseConcat();
    while (
      peek().type === TOK.LT  || peek().type === TOK.GT ||
      peek().type === TOK.LTE || peek().type === TOK.GTE
    ) {
      const op = tokens[p++].value;
      const right = parseConcat();
      left = { kind: "BinOp", op, left, right, line: left.line };
    }
    return left;
  }
  function parseConcat() {
    let left = parseAdditive();
    while (peek().type === TOK.CONCAT) {
      p++;
      const right = parseAdditive();
      left = { kind: "BinOp", op: "++", left, right, line: left.line };
    }
    return left;
  }
  function parseAdditive() {
    let left = parseMult();
    while (peek().type === TOK.PLUS || peek().type === TOK.MINUS) {
      const op = tokens[p++].value;
      const right = parseMult();
      left = { kind: "BinOp", op, left, right, line: left.line };
    }
    return left;
  }
  function parseMult() {
    let left = parseUnary();
    while (peek().type === TOK.STAR || peek().type === TOK.SLASH) {
      const op = tokens[p++].value;
      const right = parseUnary();
      left = { kind: "BinOp", op, left, right, line: left.line };
    }
    return left;
  }
  function parseUnary() {
    if (peek().type === TOK.MINUS) {
      const tok = tokens[p++];
      return { kind: "UnaryOp", op: "-", operand: parseUnary(), line: tok.line };
    }
    return parsePostfix();
  }
  function parsePostfix() {
    let node = parsePrimary();
    // All postfix operators chain left-associatively and bind tighter than
    // everything else: payload.users[0..2].*name
    while (
      peek().type === TOK.DOT ||
      peek().type === TOK.DOT_STAR ||
      peek().type === TOK.DOT_DOT ||
      peek().type === TOK.LBRACK ||
      peek().type === TOK.LPAREN
    ) {
      const t0 = peek();
      if (t0.type === TOK.DOT) {
        p++;
        const t = peek();
        if (!isFieldNameToken(t.type)) {
          throw new Error(`Expected field name after '.' but got ${t.type} (${t.value}) at line ${t.line}:${t.col}`);
        }
        const field = String(t.value);
        p++;
        node = { kind: "Selector", object: node, field, line: node.line };
      } else if (t0.type === TOK.DOT_STAR) {
        p++;
        const t = peek();
        if (!isFieldNameToken(t.type)) {
          throw new Error(`Expected field name after '.*' but got ${t.type} (${t.value}) at line ${t.line}:${t.col}`);
        }
        const field = String(t.value);
        p++;
        node = { kind: "MultiValueSelector", object: node, field, line: node.line };
      } else if (t0.type === TOK.DOT_DOT) {
        p++;
        const t = peek();
        if (!isFieldNameToken(t.type)) {
          throw new Error(`Expected field name after '..' but got ${t.type} (${t.value}) at line ${t.line}:${t.col}`);
        }
        const field = String(t.value);
        p++;
        node = { kind: "DescendantsSelector", object: node, field, line: node.line };
      } else if (t0.type === TOK.LBRACK) {
        // `[ expr ]` for IndexSelector, or `[ expr 'to' expr ]` for
        // RangeSelector. Because `to` is now a general operator (parseRange),
        // the inner expression may *already* have parsed `n to m` as a
        // RangeLit — in that case it's really a slice, so unwrap into a
        // RangeSelector. The legacy explicit form (where parseExpr returned
        // the start expression and `to` was still pending) was equivalent;
        // this branch just reflects where the `to` parsing now lives.
        eat(TOK.LBRACK);
        const inner = parseExpr();
        eat(TOK.RBRACK);
        if (inner.kind === "RangeLit") {
          node = { kind: "RangeSelector", object: node, start: inner.start, end: inner.end, line: node.line };
        } else {
          node = { kind: "IndexSelector", object: node, index: inner, line: node.line };
        }
      } else {
        // Function call: `callee(arg, arg, ...)`. LPAREN was already checked
        // by the `while` predicate added below.
        eat(TOK.LPAREN);
        const args = [];
        if (peek().type !== TOK.RPAREN) {
          args.push(parseExpr());
          while (peek().type === TOK.COMMA) { p++; args.push(parseExpr()); }
        }
        eat(TOK.RPAREN);
        node = { kind: "Call", callee: node, args: wrapDollarArgs(node, args), line: node.line };
      }
    }
    return node;
  }
  // Implicit positional params: scan an arg's AST for top-level `$`/`$$`/`$$$`
  // references (stopping at any nested Lambda — those have their own scope).
  // If found, wrap the arg as a Lambda with the corresponding params. Already
  // wrapped Lambdas are returned untouched.
  function dollarDepth(node) {
    let max = 0;
    const walk = (n) => {
      if (!n || typeof n !== "object") return;
      if (n.kind === "Lambda") return;
      if (n.kind === "Ident") {
        if (n.name === "$") max = Math.max(max, 1);
        else if (n.name === "$$") max = Math.max(max, 2);
        else if (n.name === "$$$") max = Math.max(max, 3);
        return;
      }
      for (const k of Object.keys(n)) {
        const v = n[k];
        if (Array.isArray(v)) v.forEach(walk);
        else if (v && typeof v === "object") walk(v);
      }
    };
    walk(node);
    return max;
  }
  function wrapIfDollar(arg) {
    if (!arg || arg.kind === "Lambda") return arg;
    const max = dollarDepth(arg);
    if (max === 0) return arg;
    const params = ["$", "$$", "$$$"].slice(0, max);
    return { kind: "Lambda", params, body: arg, line: arg.line };
  }
  function wrapDollarArgs(callee, args) {
    // Only auto-wrap when calling a known built-in HOF — matches real DW,
    // which rejects `$` references when the callee is a user-defined function.
    // For non-built-in calls, dollar tokens stay as plain Idents and will
    // throw at evaluation time as "Unknown identifier", same as real DW.
    if (callee && callee.kind === "Ident" && KNOWN_HOFS.has(callee.name)) {
      return args.map(wrapIfDollar);
    }
    return args;
  }
  // Speculative parse: if the next tokens form a lambda signature, consume
  // them and parse the body; otherwise rewind and return null so the caller
  // can fall back to parsing a parenthesised expression.
  function tryParseLambda() {
    const saved = p;
    if (peek().type !== TOK.LPAREN) return null;
    const openTok = tokens[p++];
    const params = [];
    const paramDefaults = [];
    if (peek().type !== TOK.RPAREN) {
      if (peek().type !== TOK.IDENT) { p = saved; return null; }
      params.push(tokens[p++].value);
      // Optional `= defaultExpr`. parseExpr is recursive but the speculative
      // lookahead is bounded by the next `,` / `)` so rewind stays correct.
      if (peek().type === TOK.ASSIGN) { p++; paramDefaults.push(parseExpr()); }
      else paramDefaults.push(null);
      while (peek().type === TOK.COMMA) {
        p++;
        if (peek().type !== TOK.IDENT) { p = saved; return null; }
        params.push(tokens[p++].value);
        if (peek().type === TOK.ASSIGN) { p++; paramDefaults.push(parseExpr()); }
        else paramDefaults.push(null);
      }
    }
    if (peek().type !== TOK.RPAREN) { p = saved; return null; }
    p++;
    if (peek().type !== TOK.ARROW) { p = saved; return null; }
    p++;
    const body = parseExpr();
    return { kind: "Lambda", params, paramDefaults, body, line: openTok.line };
  }
  function parsePrimary() {
    const t = peek();
    if (t.type === TOK.NUM) { p++; return { kind: "NumLit", value: t.value, line: t.line }; }
    if (t.type === TOK.STR) { p++; return { kind: "StrLit", value: t.value, line: t.line }; }
    if (t.type === TOK.BOOL) { p++; return { kind: "BoolLit", value: t.value, line: t.line }; }
    if (t.type === TOK.NULL) { p++; return { kind: "NullLit", line: t.line }; }
    if (t.type === TOK.IDENT) { p++; return { kind: "Ident", name: t.value, line: t.line }; }
    if (t.type === TOK.DOLLAR1) { p++; return { kind: "Ident", name: "$",   line: t.line }; }
    if (t.type === TOK.DOLLAR2) { p++; return { kind: "Ident", name: "$$",  line: t.line }; }
    if (t.type === TOK.DOLLAR3) { p++; return { kind: "Ident", name: "$$$", line: t.line }; }
    if (t.type === TOK.LPAREN) {
      // Lookahead: is this a lambda `(params) -> body` or a grouping `(expr)`?
      // A lambda's params are 0+ comma-separated IDENTs followed by `)` then `->`.
      const lambda = tryParseLambda();
      if (lambda) return lambda;
      p++; const e = parseExpr(); eat(TOK.RPAREN); return e;
    }
    if (t.type === TOK.LBRACE) return parseObject();
    if (t.type === TOK.LBRACK) return parseArray();
    throw new Error(`Unexpected token ${t.type} (${t.value}) at line ${t.line}:${t.col}`);
  }
  function parseObject() {
    const tok = eat(TOK.LBRACE);
    const fields = [];
    while (peek().type !== TOK.RBRACE) {
      const keyTok = peek();
      // Three forms: bare IDENT (or soft keyword), "string-literal", or
      // (computed-expr) for dynamic keys.
      let key = null;
      let keyExpr = null;
      const keyLine = keyTok.line;
      if (keyTok.type === TOK.LPAREN) {
        p++;
        keyExpr = parseExpr();
        eat(TOK.RPAREN);
      } else if (isFieldNameToken(keyTok.type)) {
        key = String(tokens[p++].value);
      } else if (keyTok.type === TOK.STR) {
        key = tokens[p++].value;
      } else {
        throw new Error(`Expected object key at line ${keyLine}`);
      }
      eat(TOK.COLON);
      const value = parseExpr();
      fields.push({ key, keyExpr, value, line: keyLine });
      // Real DW requires `,` between fields. After a field, allow either a
      // trailing `}` or a separating `,`. A trailing `,` before `}` is fine.
      if (peek().type === TOK.COMMA) p++;
      else if (peek().type !== TOK.RBRACE) {
        const t2 = peek();
        throw new Error(`Expected \`,\` or \`}\` after object field, got ${t2.type} (${t2.value}) at line ${t2.line}:${t2.col}`);
      }
    }
    eat(TOK.RBRACE);
    return { kind: "ObjectLit", fields, line: tok.line };
  }
  function parseArray() {
    const tok = eat(TOK.LBRACK);
    const items = [];
    while (peek().type !== TOK.RBRACK) {
      const itemLine = peek().line;
      const value = parseExpr();
      items.push({ value, line: itemLine });
      // Real DW requires `,` between items. Trailing `,` before `]` is fine.
      if (peek().type === TOK.COMMA) p++;
      else if (peek().type !== TOK.RBRACK) {
        const t2 = peek();
        throw new Error(`Expected \`,\` or \`]\` after array item, got ${t2.type} (${t2.value}) at line ${t2.line}:${t2.col}`);
      }
    }
    eat(TOK.RBRACK);
    return { kind: "ArrayLit", items, line: tok.line };
  }
}
