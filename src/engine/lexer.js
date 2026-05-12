export const TOK = {
  NUM: "NUM", STR: "STR", BOOL: "BOOL", NULL: "NULL", IDENT: "IDENT",
  PLUS: "+", MINUS: "-", STAR: "*", SLASH: "/", CONCAT: "++",
  EQ: "==", NEQ: "!=", LT: "<", GT: ">", LTE: "<=", GTE: ">=",
  AND: "and", OR: "or", NOT: "not",
  ASSIGN: "=", LPAREN: "(", RPAREN: ")", LBRACE: "{", RBRACE: "}",
  LBRACK: "[", RBRACK: "]", COMMA: ",", COLON: ":", DOT: ".",
  DOT_STAR: ".*",   // multi-value selector: `obj.*field` / `arr.*field`
  DOT_DOT: "..",    // descendants selector: `obj..field`
  SEPARATOR: "---", VAR: "var", OUTPUT: "output", DW_DIRECTIVE: "%dw",
  EOF: "EOF",
};

export function tokenize(src) {
  const tokens = [];
  let i = 0, line = 1, col = 1;
  const peek = (n = 0) => src[i + n];
  const advance = () => {
    const c = src[i++];
    if (c === "\n") { line++; col = 1; } else { col++; }
    return c;
  };
  const push = (type, value, startLine, startCol) =>
    tokens.push({ type, value, line: startLine, col: startCol });

  while (i < src.length) {
    const startLine = line, startCol = col;
    const c = peek();
    if (/\s/.test(c)) { advance(); continue; }
    if (c === "/" && peek(1) === "/") { while (i < src.length && peek() !== "\n") advance(); continue; }

    if (c === "%" && src.substr(i, 3) === "%dw") {
      advance(); advance(); advance();
      while (peek() === " " || peek() === "\t") advance();
      let v = "";
      while (i < src.length && /[\d.]/.test(peek())) v += advance();
      push(TOK.DW_DIRECTIVE, v, startLine, startCol);
      continue;
    }
    if (c === "-" && peek(1) === "-" && peek(2) === "-") {
      advance(); advance(); advance();
      push(TOK.SEPARATOR, "---", startLine, startCol);
      continue;
    }
    if (c === '"') {
      advance(); let v = "";
      while (i < src.length && peek() !== '"') {
        if (peek() === "\\") { advance(); v += advance(); }
        else v += advance();
      }
      advance();
      push(TOK.STR, v, startLine, startCol);
      continue;
    }
    if (/\d/.test(c)) {
      // Integer part, then optional `.<digits>` decimal part. Stops at a
      // single `.` so `0..field` and `0.*field` don't get eaten as numbers.
      let v = "";
      while (i < src.length && /\d/.test(peek())) v += advance();
      if (peek() === "." && /\d/.test(peek(1))) {
        v += advance();
        while (i < src.length && /\d/.test(peek())) v += advance();
      }
      push(TOK.NUM, parseFloat(v), startLine, startCol);
      continue;
    }
    if (/[a-zA-Z_]/.test(c)) {
      let v = "";
      while (i < src.length && /[a-zA-Z0-9_]/.test(peek())) v += advance();
      if (v === "var") push(TOK.VAR, v, startLine, startCol);
      else if (v === "output") push(TOK.OUTPUT, v, startLine, startCol);
      else if (v === "and") push(TOK.AND, v, startLine, startCol);
      else if (v === "or") push(TOK.OR, v, startLine, startCol);
      else if (v === "not") push(TOK.NOT, v, startLine, startCol);
      else if (v === "true" || v === "false") push(TOK.BOOL, v === "true", startLine, startCol);
      else if (v === "null") push(TOK.NULL, null, startLine, startCol);
      else push(TOK.IDENT, v, startLine, startCol);
      continue;
    }
    if (c === "+" && peek(1) === "+") { advance(); advance(); push(TOK.CONCAT, "++", startLine, startCol); continue; }
    if (c === "=" && peek(1) === "=") { advance(); advance(); push(TOK.EQ, "==", startLine, startCol); continue; }
    if (c === "!" && peek(1) === "=") { advance(); advance(); push(TOK.NEQ, "!=", startLine, startCol); continue; }
    if (c === "<" && peek(1) === "=") { advance(); advance(); push(TOK.LTE, "<=", startLine, startCol); continue; }
    if (c === ">" && peek(1) === "=") { advance(); advance(); push(TOK.GTE, ">=", startLine, startCol); continue; }
    if (c === "." && peek(1) === "*") { advance(); advance(); push(TOK.DOT_STAR, ".*", startLine, startCol); continue; }
    if (c === "." && peek(1) === ".") { advance(); advance(); push(TOK.DOT_DOT,  "..", startLine, startCol); continue; }
    const single = { "+": TOK.PLUS, "-": TOK.MINUS, "*": TOK.STAR, "/": TOK.SLASH,
      "<": TOK.LT, ">": TOK.GT, "=": TOK.ASSIGN, "(": TOK.LPAREN, ")": TOK.RPAREN,
      "{": TOK.LBRACE, "}": TOK.RBRACE, "[": TOK.LBRACK, "]": TOK.RBRACK,
      ",": TOK.COMMA, ":": TOK.COLON, ".": TOK.DOT };
    if (single[c]) { advance(); push(single[c], c, startLine, startCol); continue; }
    throw new Error(`Unexpected character "${c}" at line ${line}:${col}`);
  }
  push(TOK.EOF, null, line, col);
  return tokens;
}
