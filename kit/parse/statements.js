// Statement parsing for the subset parser: blocks, declarations, if, loops,
// return, break and continue. Functions over a Parser, split out of parser.js to
// keep each file readable.

import { UNSUPPORTED_STATEMENTS, UNSUPPORTED_TIPS } from "./parser.js";

/** @import { Parser } from "./parser.js" */
/** @import * as A from "./ast.js" */

/** @param {Parser} p @returns {A.BlockStatement} */
export function parseBlock(p) {
  const open = p.expect("{");
  /** @type {A.Statement[]} */
  const body = [];
  while (!p.is("}")) {
    if (p.tok.type === "eof") p.unexpected("expected \"}\" to close the block");
    body.push(parseStatement(p));
  }
  p.expect("}");
  return p.finish(open, { type: "BlockStatement", body });
}

/** @param {Parser} p @returns {A.Statement} */
export function parseStatement(p) {
  const t = p.tok;
  if (p.is("{")) return parseBlock(p);
  if (p.eat(";")) return p.finish(t, /** @type {A.EmptyStatement} */ ({ type: "EmptyStatement" }));
  if (t.type === "name") {
    const kw = t.value;
    if (kw in UNSUPPORTED_STATEMENTS) p.unsupported(UNSUPPORTED_STATEMENTS[kw], UNSUPPORTED_TIPS[kw] ?? "Rewrite this with if, for and plain expressions.");
    if (kw === "async") p.unsupported("async functions", "Runtime lambdas run within one frame; use a timer for anything that waits.");
    if (p.peek().value === ":" ) p.unsupported("labels", "Restructure the loop so a plain break or continue is enough.");
    switch (kw) {
      case "const": case "let": case "var": { const d = parseDeclaration(p); p.semicolon(); return d; }
      case "if": return parseIf(p);
      case "for": return parseFor(p);
      case "while": {
        p.advance(); p.expect("("); const test = p.parseExpression(); p.expect(")");
        return p.finish(t, { type: "WhileStatement", test, body: parseStatement(p) });
      }
      case "do": {
        p.advance(); const body = parseStatement(p);
        p.expect("while"); p.expect("("); const test = p.parseExpression(); p.expect(")"); p.eat(";");
        return p.finish(t, { type: "DoWhileStatement", body, test });
      }
      case "return": {
        p.advance();
        const argument = p.is(";") || p.is("}") || p.tok.type === "eof" || p.tok.nlBefore ? null : p.parseExpression();
        p.semicolon();
        return p.finish(t, { type: "ReturnStatement", argument });
      }
      case "break": case "continue": {
        p.advance();
        if (p.tok.type === "name" && !p.tok.nlBefore) p.unsupported("labels", "Restructure the loop so a plain break or continue is enough.");
        p.semicolon();
        return p.finish(t, /** @type {A.BreakStatement | A.ContinueStatement} */ ({ type: kw === "break" ? "BreakStatement" : "ContinueStatement", label: null }));
      }
    }
  }
  const expression = p.parseExpression();
  p.semicolon();
  return p.finish(t, { type: "ExpressionStatement", expression });
}

/** Parses `const a = 1, [b, c] = d` without the trailing semicolon. @param {Parser} p @returns {A.VariableDeclaration} */
export function parseDeclaration(p) {
  const t = p.advance();
  const kind = /** @type {"const" | "let" | "var"} */ (t.value);
  /** @type {A.VariableDeclarator[]} */
  const declarations = [];
  do {
    const id = p.parseBindingTarget();
    const init = p.eat("=") ? p.parseAssign() : null;
    declarations.push(p.finish(id, { type: "VariableDeclarator", id, init }));
  } while (!p.is("of") && p.eat(","));
  return p.finish(t, { type: "VariableDeclaration", kind, declarations });
}

/** @param {Parser} p @returns {A.IfStatement} */
export function parseIf(p) {
  const t = p.advance();
  p.expect("(");
  const test = p.parseExpression();
  p.expect(")");
  const consequent = parseStatement(p);
  const alternate = p.eat("else") ? parseStatement(p) : null;
  return p.finish(t, { type: "IfStatement", test, consequent, alternate });
}

/** @param {Parser} p @returns {A.ForStatement | A.ForOfStatement} */
export function parseFor(p) {
  const t = p.advance();
  p.expect("(");
  /** @type {A.VariableDeclaration | A.Expression | null} */
  let init = null;
  if (!p.is(";")) {
    init = p.tok.type === "name" && ["const", "let", "var"].includes(p.tok.value) ? parseDeclaration(p) : p.parseExpression();
    if (p.is("in")) p.unsupported("for…in", "Use for…of over a fixed collection, or a counted for loop.");
    if (p.eat("of")) {
      const left = init.type === "VariableDeclaration" ? init : p.toPattern(init, false);
      const right = p.parseAssign();
      p.expect(")");
      return p.finish(t, { type: "ForOfStatement", left, right, body: parseStatement(p) });
    }
  }
  p.expect(";", "after the loop's start");
  const test = p.is(";") ? null : p.parseExpression();
  p.expect(";", "after the loop's condition");
  const update = p.is(")") ? null : p.parseExpression();
  p.expect(")");
  return p.finish(t, { type: "ForStatement", init, test, update, body: parseStatement(p) });
}
