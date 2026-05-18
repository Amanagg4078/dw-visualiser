import { tokenize } from "./lexer.js";
import { parse } from "./parser.js";
import { evaluate } from "./evaluator.js";

export { TOK, tokenize } from "./lexer.js";
export { parse } from "./parser.js";
export { evaluate, exprToStr, formatValue } from "./evaluator.js";
export { buildLineSteps, lineIndexForStep } from "./trace.js";
export * as semantics from "./semantics.js";

// Convenience: lex + parse + evaluate in one call.
export function run(src, payload) {
  const tokens = tokenize(src);
  const ast = parse(tokens);
  const { result, trace } = evaluate(ast, payload);
  return { tokens, ast, result, trace };
}
