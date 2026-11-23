// Statement parsing for the subset parser: blocks, declarations, if, loops,
// return, break and continue. Functions over a Parser, split out of parser.js to
// keep each file readable.

import { UNSUPPORTED_STATEMENTS, UNSUPPORTED_TIPS } from "./parser.js";
import { SyntaxFailure } from "./lexer.js";

/** @import { Parser } from "./parser.js" */
/** @import * as A from "./ast.js" */

const ASYNC_TIP = "Runtime lambdas run within one frame; use a timer for anything that waits.";

/**
 * Parses `{ … }`. A function body shares its scope with the parameters, which the caller has pushed.
 * @param {Parser} p @param {boolean} [functionBody] @returns {A.BlockStatement}
 */
export function parseBlock(p, functionBody = false) {
  const open = p.expect("{");
  if (!functionBody) p.pushScope(false);
  /** @type {A.Statement[]} */
  const body = [];
  while (!p.is("}")) {
    if (p.tok.type === "eof") p.unexpected("expected \"}\" to close the block");
    body.push(parseStatement(p));
  }
  p.expect("}");
  if (!functionBody) p.popScope();
  return p.finish(open, { type: "BlockStatement", body });
}

/** The body of an if, else or loop: a lexical declaration there is a syntax error. @param {Parser} p @returns {A.Statement} */
function parseBody(p) {
  const t = p.tok;
  if (t.type === "name" && (t.value === "const" || (t.value === "let" && startsBinding(p.peek())))) {
    p.unexpected("a lexical declaration cannot be the body of a statement; wrap it in { }");
  }
  return parseStatement(p);
}

/** Whether the token after `let` makes it a declaration. @param {import("./lexer.js").Token} next */
function startsBinding(next) {
  return (next.type === "name" && !["in", "instanceof", "of"].includes(next.value)) || (next.type === "punct" && (next.value === "[" || next.value === "{"));
}

/** @param {Parser} p @returns {A.Statement} */
export function parseStatement(p) {
  const t = p.tok;
  if (p.is("{")) return parseBlock(p);
  if (p.eat(";")) return p.finish(t, /** @type {A.EmptyStatement} */ ({ type: "EmptyStatement" }));
  if (t.type === "name") {
    const kw = t.value;
    if (UNSUPPORTED_STATEMENTS.has(kw)) p.unsupported(/** @type {string} */ (UNSUPPORTED_STATEMENTS.get(kw)), UNSUPPORTED_TIPS.get(kw) ?? "Rewrite this with if, for and plain expressions.");
    if (kw === "async") { const n = p.peek(); if (n.type === "name" && !n.nlBefore && !["in", "instanceof", "of"].includes(n.value)) p.unsupported("async functions", ASYNC_TIP); }
    if (p.peek().value === ":") p.unsupported("labels", "Restructure the loop so a plain break or continue is enough.");
    switch (kw) {
      case "const": case "let": case "var": {
        const d = parseDeclaration(p, false);
        checkInitializers(d);
        p.semicolon();
        return d;
      }
      case "if": return parseIf(p);
      case "for": return parseFor(p);
      case "while": {
        p.advance(); p.expect("("); const test = p.parseExpression(); p.expect(")");
        return p.finish(t, { type: "WhileStatement", test, body: parseBody(p) });
      }
      case "do": {
        p.advance(); const body = parseBody(p);
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

/**
 * Parses `const a = 1, [b, c] = d` without the trailing semicolon. A `for` head defers the
 * initializer rule to its caller, because `for (const x of xs)` has none.
 * @param {Parser} p @param {boolean} inFor @returns {A.VariableDeclaration}
 */
export function parseDeclaration(p, inFor) {
  const t = p.advance();
  const kind = /** @type {"const" | "let" | "var"} */ (t.value);
  /** @type {A.VariableDeclarator[]} */
  const declarations = [];
  do {
    const id = p.parseBindingTarget(kind);
    const init = p.eat("=") ? p.parseAssign() : null;
    declarations.push(p.finish(id, { type: "VariableDeclarator", id, init }));
  } while (!(inFor && (p.is("of") || p.is("in"))) && p.eat(","));
  return p.finish(t, { type: "VariableDeclaration", kind, declarations });
}

/** Rejects `const x;` and `let [a];`, which JavaScript rejects. @param {A.VariableDeclaration} d */
function checkInitializers(d) {
  for (const decl of d.declarations) {
    if (decl.init === null && (d.kind === "const" || decl.id.type !== "Identifier")) {
      throw new SyntaxFailure("P001", d.kind === "const" ? "A const declaration needs an initial value." : "A destructuring declaration needs an initial value.", "Write = value after the name, or use let for a name assigned later.", decl.range[0], decl.range[1]);
    }
  }
}

/** @param {Parser} p @returns {A.IfStatement} */
export function parseIf(p) {
  const t = p.advance();
  p.expect("(");
  const test = p.parseExpression();
  p.expect(")");
  const consequent = parseBody(p);
  const alternate = p.eat("else") ? parseBody(p) : null;
  return p.finish(t, { type: "IfStatement", test, consequent, alternate });
}

/** @param {Parser} p @returns {A.ForStatement | A.ForOfStatement} */
export function parseFor(p) {
  const t = p.advance();
  p.expect("(");
  p.pushScope(false);
  /** @type {A.VariableDeclaration | A.Expression | null} */
  let init = null;
  if (!p.is(";")) {
    const savedNoIn = p.noIn;
    p.noIn = true;
    const declares = p.tok.type === "name" && (p.tok.value === "const" || p.tok.value === "var" || (p.tok.value === "let" && startsBinding(p.peek())));
    init = declares ? parseDeclaration(p, true) : p.parseExpression();
    p.noIn = savedNoIn;
    if (p.is("in")) p.unsupported("for…in", "Use for…of over a fixed collection, or a counted for loop.");
    if (p.eat("of")) {
      if (init.type === "VariableDeclaration" && (init.declarations.length !== 1 || init.declarations[0].init !== null)) {
        throw new SyntaxFailure("P001", "A for…of head declares one name and takes no initial value.", "Write for (const x of list).", init.range[0], init.range[1]);
      }
      const left = init.type === "VariableDeclaration" ? init : p.toPattern(init, false);
      const right = p.parseAssign();
      p.expect(")");
      const body = parseBody(p);
      p.popScope();
      return p.finish(t, { type: "ForOfStatement", left, right, body });
    }
    if (init.type === "VariableDeclaration") checkInitializers(init);
  }
  p.expect(";", "after the loop's start");
  const test = p.is(";") ? null : p.parseExpression();
  p.expect(";", "after the loop's condition");
  const update = p.is(")") ? null : p.parseExpression();
  p.expect(")");
  const body = parseBody(p);
  p.popScope();
  return p.finish(t, { type: "ForStatement", init, test, update, body });
}
