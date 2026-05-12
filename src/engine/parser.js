import { TOK } from "./lexer.js";

// Tokens whose source text is a valid identifier even though they're
// reserved as keywords elsewhere. Used as field names after `.` and as
// bare object keys — DataWeave treats these as "soft" keywords.
function isFieldNameToken(type) {
  return type === TOK.IDENT
    || type === TOK.AND  || type === TOK.OR  || type === TOK.NOT
    || type === TOK.VAR  || type === TOK.OUTPUT;
}

// Grammar (informal):
//   Script    := Header SEPARATOR Expr
//   Header    := (DwDirective | OutputDecl | VarDecl)*   // any order, all optional
//   VarDecl   := 'var' IDENT '=' Expr
//   Expr      := Or
//   Or        := And ('or' And)*
//   And       := LogicalNot ('and' LogicalNot)*
//   LogicalNot:= 'not' LogicalNot | Equality
//   Equality  := Compare (('=='|'!=') Compare)*
//   Compare   := Concat (('<'|'>') Concat)*
//   Concat    := Additive (('++') Additive)*
//   Additive  := Mult (('+'|'-') Mult)*
//   Mult      := Unary (('*'|'/') Unary)*
//   Unary     := '-' Unary | Postfix
//   Postfix   := Primary ( '.' IDENT
//                         | '.*' IDENT         (multi-value selector)
//                         | '..' IDENT         (descendants selector)
//                         | '[' Expr ('to' Expr)? ']'  (index or range)
//                         )*
//   Primary   := NUM|STR|BOOL|NULL|IDENT|'('Expr')'|Object|Array
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
    } else {
      throw new Error(`Unexpected token in header: ${t.type} (${t.value}) at line ${t.line}:${t.col}`);
    }
  }
  eat(TOK.SEPARATOR);
  const body = parseExpr();
  return { kind: "Script", header, body };

  function parseExpr() { return parseOr(); }
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
      peek().type === TOK.LBRACK
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
      } else {
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
      }
    }
    return node;
  }
  function parsePrimary() {
    const t = peek();
    if (t.type === TOK.NUM) { p++; return { kind: "NumLit", value: t.value, line: t.line }; }
    if (t.type === TOK.STR) { p++; return { kind: "StrLit", value: t.value, line: t.line }; }
    if (t.type === TOK.BOOL) { p++; return { kind: "BoolLit", value: t.value, line: t.line }; }
    if (t.type === TOK.NULL) { p++; return { kind: "NullLit", line: t.line }; }
    if (t.type === TOK.IDENT) { p++; return { kind: "Ident", name: t.value, line: t.line }; }
    if (t.type === TOK.LPAREN) {
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
