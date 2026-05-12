import { TOK } from "./lexer.js";

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
  // %dw and output are currently parsed-then-ignored by the evaluator, so
  // their position doesn't affect runtime behaviour. Vars are evaluated in
  // declaration order at eval time.
  const header = { vars: [], output: "application/json" };
  while (peek().type !== TOK.SEPARATOR && peek().type !== TOK.EOF) {
    const t = peek();
    if (t.type === TOK.DW_DIRECTIVE) {
      p++;
    } else if (t.type === TOK.OUTPUT) {
      p++;
      let mime = "";
      while (peek().type === TOK.IDENT || peek().type === TOK.SLASH) {
        mime += peek().value;
        p++;
      }
      header.output = mime;
    } else if (t.type === TOK.VAR) {
      const tok = eat(TOK.VAR);
      const name = eat(TOK.IDENT).value;
      eat(TOK.ASSIGN);
      const expr = parseExpr();
      header.vars.push({ kind: "VarDecl", name, expr, line: tok.line });
    } else if (t.type === TOK.FUN) {
      // `fun name(params) = body` — sugar for `var name = (params) -> body`.
      // Stored in the same `header.vars` list so evaluation order is preserved.
      const tok = eat(TOK.FUN);
      const name = eat(TOK.IDENT).value;
      eat(TOK.LPAREN);
      const params = [];
      if (peek().type !== TOK.RPAREN) {
        params.push(eat(TOK.IDENT).value);
        while (peek().type === TOK.COMMA) { p++; params.push(eat(TOK.IDENT).value); }
      }
      eat(TOK.RPAREN);
      eat(TOK.ASSIGN);
      const body = parseExpr();
      const lambda = { kind: "Lambda", params, body, line: tok.line };
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
    const head = parseInfix();
    if (peek().type === TOK.MATCH) return parseMatchTail(head);
    return head;
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
  // We exclude `to` from infix consideration: it's a *contextual* keyword used
  // inside `arr[n to m]` (range selector). Without this exclusion, `0 to 2`
  // inside the brackets would parse as a `to(0, 2)` function call, breaking
  // range selection.
  function parseInfix() {
    let left = parseOr();
    while (peek().type === TOK.IDENT && peek().value !== "to") {
      const fnTok = tokens[p++];
      const right = parseOr();
      left = {
        kind: "Call",
        callee: { kind: "Ident", name: fnTok.value, line: fnTok.line },
        args: wrapDollarArgs([left, right]),
        line: left.line ?? fnTok.line,
      };
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
    while (peek().type === TOK.EQ || peek().type === TOK.NEQ) {
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
        // `[ expr ]` for IndexSelector, or `[ expr 'to' expr ]` for RangeSelector.
        // `to` is a *contextual* keyword — only special inside the brackets,
        // so `var to = 5` still works elsewhere.
        eat(TOK.LBRACK);
        const startExpr = parseExpr();
        if (peek().type === TOK.IDENT && peek().value === "to") {
          p++;
          const endExpr = parseExpr();
          eat(TOK.RBRACK);
          node = { kind: "RangeSelector", object: node, start: startExpr, end: endExpr, line: node.line };
        } else {
          eat(TOK.RBRACK);
          node = { kind: "IndexSelector", object: node, index: startExpr, line: node.line };
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
        node = { kind: "Call", callee: node, args: wrapDollarArgs(args), line: node.line };
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
  function wrapDollarArgs(args) {
    return args.map(wrapIfDollar);
  }
  // Speculative parse: if the next tokens form a lambda signature, consume
  // them and parse the body; otherwise rewind and return null so the caller
  // can fall back to parsing a parenthesised expression.
  function tryParseLambda() {
    const saved = p;
    if (peek().type !== TOK.LPAREN) return null;
    const openTok = tokens[p++];
    const params = [];
    if (peek().type !== TOK.RPAREN) {
      if (peek().type !== TOK.IDENT) { p = saved; return null; }
      params.push(tokens[p++].value);
      while (peek().type === TOK.COMMA) {
        p++;
        if (peek().type !== TOK.IDENT) { p = saved; return null; }
        params.push(tokens[p++].value);
      }
    }
    if (peek().type !== TOK.RPAREN) { p = saved; return null; }
    p++;
    if (peek().type !== TOK.ARROW) { p = saved; return null; }
    p++;
    const body = parseExpr();
    return { kind: "Lambda", params, body, line: openTok.line };
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
      let key;
      if (isFieldNameToken(keyTok.type)) { key = String(tokens[p++].value); }
      else if (keyTok.type === TOK.STR) key = tokens[p++].value;
      else throw new Error(`Expected object key at line ${keyTok.line}`);
      eat(TOK.COLON);
      const value = parseExpr();
      fields.push({ key, value, line: keyTok.line });
      if (peek().type === TOK.COMMA) p++;
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
      if (peek().type === TOK.COMMA) p++;
    }
    eat(TOK.RBRACK);
    return { kind: "ArrayLit", items, line: tok.line };
  }
}
