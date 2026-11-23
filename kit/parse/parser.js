// Recursive-descent parser for the source of one arrow function, producing an
// ESTree subset with spans. It parses more than the runtime subset allows, so
// that checkSubset can report every violation at once with a fix; syntax no
// lambda uses (classes, switch, regex…) stops with P004.
//
// Arrow parameters and destructuring use the "cover grammar" approach: parse as
// an expression, then convert to a pattern once `=>` or `=` shows it was one.

import { Lexer, SyntaxFailure } from "./lexer.js";
import { parseBlock } from "./statements.js";

/** @import { Token } from "./lexer.js" */
/** @import * as A from "./ast.js" */

const BINARY_PRECEDENCE = /** @type {Record<string, number>} */ ({
  "??": 1, "||": 2, "&&": 3, "|": 4, "^": 5, "&": 6,
  "==": 7, "!=": 7, "===": 7, "!==": 7,
  "<": 8, ">": 8, "<=": 8, ">=": 8, instanceof: 8, in: 8,
  "<<": 9, ">>": 9, ">>>": 9, "+": 10, "-": 10, "*": 11, "/": 11, "%": 11, "**": 12,
});
const ASSIGN_OPS = new Set(["=", "+=", "-=", "*=", "/=", "%=", "**=", "<<=", ">>=", ">>>=", "|=", "^=", "&=", "||=", "&&=", "??="]);
const UNARY_OPS = new Set(["!", "~", "+", "-", "typeof", "void", "delete"]);
/** Keyword-led syntax no runtime lambda uses: parsing stops with P004. */
export const UNSUPPORTED_STATEMENTS = /** @type {Record<string, string>} */ ({
  switch: "a switch statement", class: "a class", function: "a function declaration", try: "try/catch", throw: "throw",
  with: "with", import: "import", export: "export", yield: "yield", debugger: "debugger",
});
export const UNSUPPORTED_TIPS = /** @type {Record<string, string>} */ ({
  switch: "Use if / else if chains.",
  class: "Declare types and constructs in the dialect, not inside a runtime lambda.",
  function: "Use a helper declared in the dialect (lib/), or inline the code.",
  try: "Runtime lambdas cannot catch errors; check the condition with if instead.",
  throw: "Return early instead; the kit reports runtime errors itself.",
});
const LITERAL_NAMES = /** @type {Record<string, boolean | null>} */ ({ true: true, false: false, null: null });

export class Parser {
  /** @param {string} src */
  constructor(src) {
    this.src = src;
    this.lexer = new Lexer(src);
    /** @type {Token} */
    this.tok = this.lexer.next();
    /** @type {Token} */
    this.prev = this.tok;
    /** Nodes written inside parentheses, so `(-a) ** 2` is allowed and `-a ** 2` is not. @type {WeakSet<object>} */
    this.parenthesized = new WeakSet();
  }

  // ---------- token helpers ----------

  advance() { this.prev = this.tok; this.tok = this.lexer.next(); return this.prev; }
  /** Looks one token ahead without consuming. */
  peek() { const s = this.lexer.save(); const t = this.lexer.next(); this.lexer.restore(s); return t; }
  /** @param {string} v */
  is(v) { return (this.tok.type === "punct" || this.tok.type === "name") && this.tok.value === v; }
  /** @param {string} v */
  eat(v) { if (this.is(v)) { this.advance(); return true; } return false; }
  /** @param {string} v @param {string} [context] */
  expect(v, context) {
    if (!this.is(v)) this.unexpected(`expected "${v}"${context ? ` ${context}` : ""}`);
    return this.advance();
  }
  /** @param {string} [why] @returns {never} */
  unexpected(why) {
    const t = this.tok;
    const what = t.type === "eof" ? "the end of the lambda" : `"${t.value}"`;
    throw new SyntaxFailure("P001", `Unexpected ${what}${why ? `: ${why}` : ""}.`, "Check for a missing operator, bracket or comma just before this point.", t.start, Math.max(t.end, t.start + 1));
  }
  /** @param {string} what @param {string} tip @param {Token} [t] @returns {never} */
  unsupported(what, tip, t = this.tok) {
    throw new SyntaxFailure("P004", `Runtime lambdas do not support ${what}.`, tip, t.start, Math.max(t.end, t.start + 1));
  }
  /** Ends a statement: `;`, or a line break, `}` or the end (automatic semicolon insertion). */
  semicolon() {
    if (this.eat(";")) return;
    if (this.is("}") || this.tok.type === "eof" || this.tok.nlBefore) return;
    this.unexpected("expected \";\" or a line break");
  }

  /**
   * Finishes a node that started at `start` (a token or node) and ends at the last consumed token.
   * @template {object} T @param {{ start?: number, loc: any, range?: [number, number] }} start @param {T} props @returns {T & { loc: A.Loc, range: [number, number] }}
   */
  finish(start, props) {
    const from = start.range ? start.range[0] : /** @type {number} */ (start.start);
    const fromLoc = start.range ? start.loc.start : start.loc;
    return { ...props, loc: { start: fromLoc, end: this.prev.endLoc }, range: [from, this.prev.end] };
  }

  // ---------- entry ----------

  /** Parses the whole source as one arrow function. @returns {A.ArrowFunctionExpression} */
  parseLambda() {
    const first = this.tok;
    if (first.type === "name" && first.value === "function") {
      throw new SyntaxFailure("P003", "This is a function expression, not an arrow function.", "Write it as an arrow function: (a, b) => { … }.", first.start, first.end);
    }
    if (first.type === "name" && first.value === "async") this.unsupported("async functions", "Runtime lambdas run within one frame; use a timer for anything that waits.");
    const expr = this.parseAssign();
    if (expr.type !== "ArrowFunctionExpression") {
      throw new SyntaxFailure("P003", "The source is not an arrow function.", "A runtime lambda is one arrow function, like (self, w) => { … }.", expr.range[0], expr.range[1]);
    }
    if (this.tok.type !== "eof") {
      throw new SyntaxFailure("P003", "There is more source after the arrow function.", "A runtime lambda is exactly one arrow function; remove what follows it.", this.tok.start, this.src.length);
    }
    return expr;
  }

  // ---------- expressions ----------

  /** @returns {A.Expression} */
  parseExpression() {
    const first = this.parseAssign();
    if (!this.is(",")) return first;
    const expressions = [first];
    while (this.eat(",")) expressions.push(this.parseAssign());
    return this.finish(first, { type: "SequenceExpression", expressions });
  }

  /** @returns {A.Expression} */
  parseAssign() {
    if (this.tok.type === "name" && this.peek().value === "=>" && !(this.tok.value in LITERAL_NAMES)) {
      const t = this.advance();
      const param = this.finish(t, /** @type {A.Identifier} */ ({ type: "Identifier", name: t.value }));
      return this.parseArrowRest(t, [param]);
    }
    const left = this.parseConditional();
    if (this.tok.type === "punct" && ASSIGN_OPS.has(this.tok.value)) {
      const opTok = this.advance();
      const operator = /** @type {A.AssignmentOperator} */ (opTok.value);
      const target = operator === "=" ? this.toPattern(left, false) : this.simpleTarget(left);
      const right = this.parseAssign();
      return this.finish(left, { type: "AssignmentExpression", operator, left: target, right });
    }
    return left;
  }

  /** @returns {A.Expression} */
  parseConditional() {
    const test = this.parseBinary(1);
    if (!this.eat("?")) return test;
    const consequent = this.parseAssign();
    this.expect(":", "in a conditional expression");
    const alternate = this.parseAssign();
    return this.finish(test, { type: "ConditionalExpression", test, consequent, alternate });
  }

  /** Precedence climbing over binary and logical operators. @param {number} minPrec @returns {A.Expression} */
  parseBinary(minPrec) {
    let left = this.parseUnary();
    while (true) {
      const op = this.tok.value;
      const prec = (this.tok.type === "punct" || op === "in" || op === "instanceof") ? BINARY_PRECEDENCE[op] : undefined;
      if (prec === undefined || prec < minPrec) return left;
      if (op === "**" && left.type === "UnaryExpression" && !this.parenthesized.has(left)) {
        throw new SyntaxFailure("P001", `A unary "${left.operator}" cannot come directly before **.`, `Add parentheses: (${left.operator}x) ** y.`, left.range[0], this.tok.end);
      }
      this.advance();
      const right = this.parseBinary(op === "**" ? prec : prec + 1);
      left = op === "||" || op === "&&" || op === "??"
        ? this.finish(left, { type: "LogicalExpression", operator: /** @type {A.LogicalOperator} */ (op), left, right })
        : this.finish(left, { type: "BinaryExpression", operator: /** @type {A.BinaryOperator} */ (op), left, right });
    }
  }

  /** @returns {A.Expression} */
  parseUnary() {
    const t = this.tok;
    if ((t.type === "punct" || t.type === "name") && UNARY_OPS.has(t.value)) {
      this.advance();
      const argument = this.parseUnary();
      return this.finish(t, { type: "UnaryExpression", operator: /** @type {A.UnaryOperator} */ (t.value), prefix: /** @type {true} */ (true), argument });
    }
    if (this.is("++") || this.is("--")) {
      this.advance();
      const argument = this.simpleTarget(this.parseUnary());
      return this.finish(t, { type: "UpdateExpression", operator: /** @type {"++" | "--"} */ (t.value), prefix: true, argument });
    }
    if (t.type === "name" && t.value === "await") this.unsupported("await", "Runtime lambdas run within one frame; use a timer for anything that waits.");
    const expr = this.parseCallMember();
    if ((this.is("++") || this.is("--")) && !this.tok.nlBefore) {
      const op = this.advance();
      return this.finish(expr, { type: "UpdateExpression", operator: /** @type {"++" | "--"} */ (op.value), prefix: false, argument: this.simpleTarget(expr) });
    }
    return expr;
  }

  /** Member access, calls and `new`, left to right. @returns {A.Expression} */
  parseCallMember() {
    let expr;
    if (this.tok.type === "name" && this.tok.value === "new") {
      const t = this.advance();
      let callee = this.parsePrimary();
      while (this.is(".") || this.is("[")) callee = this.parseMemberStep(callee, false);
      const args = this.is("(") ? this.parseArguments() : [];
      expr = this.finish(t, /** @type {A.NewExpression} */ ({ type: "NewExpression", callee, arguments: args }));
    } else expr = this.parsePrimary();
    while (true) {
      if (this.is(".") || this.is("[")) expr = this.parseMemberStep(expr, false);
      else if (this.is("?.")) {
        this.advance();
        if (this.is("(")) expr = this.finish(expr, /** @type {A.CallExpression} */ ({ type: "CallExpression", callee: expr, arguments: this.parseArguments(), optional: true }));
        else expr = this.parseMemberStep(expr, true);
      } else if (this.is("(")) expr = this.finish(expr, /** @type {A.CallExpression} */ ({ type: "CallExpression", callee: expr, arguments: this.parseArguments(), optional: false }));
      else if (this.tok.type === "template") this.unsupported("tagged templates", "Call the function with ordinary arguments instead.");
      else return expr;
    }
  }

  /** One `.name` or `[expr]` step; after `?.` the dot is already consumed. @param {A.Expression} object @param {boolean} optional @returns {A.MemberExpression} */
  parseMemberStep(object, optional) {
    if (this.eat("[")) {
      const property = this.parseExpression();
      this.expect("]", "to close the index");
      return this.finish(object, { type: "MemberExpression", object, property, computed: true, optional });
    }
    if (!optional) this.advance();
    if (this.tok.type !== "name") this.unexpected("expected a property name after \".\"");
    const t = this.advance();
    const property = this.finish(t, /** @type {A.Identifier} */ ({ type: "Identifier", name: t.value }));
    return this.finish(object, { type: "MemberExpression", object, property, computed: false, optional });
  }

  /** @returns {Array<A.Expression | A.SpreadElement>} */
  parseArguments() {
    this.expect("(");
    /** @type {Array<A.Expression | A.SpreadElement>} */
    const args = [];
    while (!this.is(")")) {
      args.push(this.parseSpreadOrAssign());
      if (!this.is(")")) this.expect(",", "between arguments");
    }
    this.expect(")");
    return args;
  }

  /** @returns {A.Expression | A.SpreadElement} */
  parseSpreadOrAssign() {
    if (this.is("...")) {
      const t = this.advance();
      return this.finish(t, /** @type {A.SpreadElement} */ ({ type: "SpreadElement", argument: this.parseAssign() }));
    }
    return this.parseAssign();
  }

  /** @returns {A.Expression} */
  parsePrimary() {
    const t = this.tok;
    if (t.type === "num" || t.type === "string") {
      this.advance();
      return this.finish(t, /** @type {A.Literal} */ ({ type: "Literal", value: /** @type {number | string} */ (t.literal), raw: t.value }));
    }
    if (t.type === "template") return this.parseTemplate();
    if (t.type === "name") {
      if (t.value in LITERAL_NAMES) { this.advance(); return this.finish(t, /** @type {A.Literal} */ ({ type: "Literal", value: LITERAL_NAMES[t.value], raw: t.value })); }
      if (t.value === "this") { this.advance(); return this.finish(t, /** @type {A.ThisExpression} */ ({ type: "ThisExpression" })); }
      if (t.value === "function" || t.value === "class") this.unsupported(UNSUPPORTED_STATEMENTS[t.value].replace(" declaration", " expression"), UNSUPPORTED_TIPS[t.value]);
      if (t.value === "async" && (this.peek().value === "(" || this.peek().type === "name")) this.unsupported("async functions", "Runtime lambdas run within one frame; use a timer for anything that waits.");
      this.advance();
      return this.finish(t, /** @type {A.Identifier} */ ({ type: "Identifier", name: t.value }));
    }
    if (this.is("(")) return this.parseParenOrArrow();
    if (this.is("[")) return this.parseArray();
    if (this.is("{")) return this.parseObject();
    if (this.is("/") || this.is("/=")) this.unsupported("regular expression literals", "Compare strings directly, or declare the check as a helper in the dialect.");
    return this.unexpected();
  }

  /** @returns {A.Expression} */
  parseParenOrArrow() {
    const open = this.advance();
    if (this.eat(")")) {
      if (!this.is("=>")) this.unexpected("expected \"=>\" after ()");
      return this.parseArrowRest(open, []);
    }
    const inner = this.parseExpression();
    this.expect(")", "to close the parenthesis");
    if (this.is("=>")) {
      const items = inner.type === "SequenceExpression" && !this.parenthesized.has(inner) ? inner.expressions : [inner];
      return this.parseArrowRest(open, items.map((e) => this.toPattern(e, true)));
    }
    this.parenthesized.add(inner);
    return inner;
  }

  /** Parses `=> body` given the already-parsed parameters. @param {Token} start @param {A.Pattern[]} params @returns {A.ArrowFunctionExpression} */
  parseArrowRest(start, params) {
    this.expect("=>");
    if (this.is("{")) {
      const body = parseBlock(this);
      return this.finish(start, { type: "ArrowFunctionExpression", params, body, expression: false });
    }
    const body = this.parseAssign();
    return this.finish(start, { type: "ArrowFunctionExpression", params, body, expression: true });
  }

  /** @returns {A.TemplateLiteral} */
  parseTemplate() {
    const start = this.tok;
    /** @type {A.TemplateElement[]} */
    const quasis = [];
    /** @type {A.Expression[]} */
    const expressions = [];
    let chunk = this.tok;
    while (true) {
      const tpl = /** @type {NonNullable<Token["template"]>} */ (chunk.template);
      quasis.push({ type: "TemplateElement", value: { raw: tpl.raw, cooked: tpl.cooked }, tail: tpl.tail, loc: { start: chunk.loc, end: chunk.endLoc }, range: [chunk.start, chunk.end] });
      if (tpl.tail) break;
      this.advance();
      expressions.push(this.parseExpression());
      if (!this.is("}")) this.unexpected("expected \"}\" to close ${…}");
      chunk = this.lexer.continueTemplate(this.tok);
      this.tok = chunk;
    }
    this.advance();
    return this.finish(start, { type: "TemplateLiteral", quasis, expressions });
  }

  /** @returns {A.ArrayExpression} */
  parseArray() {
    const open = this.advance();
    /** @type {Array<A.Expression | A.SpreadElement | null>} */
    const elements = [];
    while (!this.is("]")) {
      if (this.is(",")) { this.advance(); elements.push(null); continue; }
      elements.push(this.parseSpreadOrAssign());
      if (!this.is("]")) this.expect(",", "between array elements");
    }
    this.expect("]");
    return this.finish(open, { type: "ArrayExpression", elements });
  }

  /** @returns {A.ObjectExpression} */
  parseObject() {
    const open = this.advance();
    /** @type {Array<A.Property | A.SpreadElement>} */
    const properties = [];
    while (!this.is("}")) {
      properties.push(this.parseProperty());
      if (!this.is("}")) this.expect(",", "between properties");
    }
    this.expect("}");
    return this.finish(open, { type: "ObjectExpression", properties });
  }

  /** @returns {A.Property | A.SpreadElement} */
  parseProperty() {
    const t = this.tok;
    if (this.is("...")) { this.advance(); return this.finish(t, /** @type {A.SpreadElement} */ ({ type: "SpreadElement", argument: this.parseAssign() })); }
    /** @type {A.Property["key"]} */
    let key;
    let computed = false;
    if (this.eat("[")) { key = this.parseAssign(); this.expect("]"); computed = true; }
    else if (t.type === "name") {
      const next = this.peek();
      if ((t.value === "get" || t.value === "set") && (next.type === "name" || next.type === "string" || next.type === "num")) this.unsupported("getters and setters", "Use a plain property, or a method declared on the construct.");
      this.advance();
      key = this.finish(t, /** @type {A.Identifier} */ ({ type: "Identifier", name: t.value }));
    } else if (t.type === "string" || t.type === "num") {
      this.advance();
      key = this.finish(t, /** @type {A.Literal} */ ({ type: "Literal", value: /** @type {number | string} */ (t.literal), raw: t.value }));
    } else return this.unexpected("expected a property name");
    if (this.is("(")) this.unsupported("object methods", "Use a plain property; behavior belongs in a method declared on the construct.", t);
    if (this.eat(":")) return this.finish(t, { type: "Property", key, value: this.parseAssign(), computed, shorthand: false, kind: /** @type {"init"} */ ("init"), method: /** @type {false} */ (false) });
    if (key.type !== "Identifier" || computed) this.unexpected("expected \":\" after the property name");
    /** @type {A.Expression} */
    let value = key;
    if (this.is("=")) {
      // Only valid once converted to a pattern: `({ k = 4 }) => …`.
      this.advance();
      const right = this.parseAssign();
      value = this.finish(key, { type: "AssignmentExpression", operator: /** @type {"="} */ ("="), left: key, right });
    }
    return this.finish(t, { type: "Property", key, value, computed: false, shorthand: true, kind: /** @type {"init"} */ ("init"), method: /** @type {false} */ (false) });
  }

  // ---------- patterns ----------

  /**
   * Converts a parsed expression to a binding or assignment pattern.
   * @param {A.Expression} e @param {boolean} binding  Parameters and declarations accept only names and destructuring.
   * @returns {A.Pattern}
   */
  toPattern(e, binding) {
    switch (e.type) {
      case "Identifier": return e;
      case "MemberExpression": if (!binding && !e.optional) return e; break;
      case "AssignmentExpression":
        if (e.operator === "=") return { type: "AssignmentPattern", left: this.toPattern(/** @type {A.Expression} */ (e.left), binding), right: e.right, loc: e.loc, range: e.range };
        break;
      case "ArrayExpression":
        return {
          type: "ArrayPattern", loc: e.loc, range: e.range,
          elements: e.elements.map((el) => {
            if (el === null) return null;
            if (el.type === "SpreadElement") this.unsupported("rest elements", "List the elements you need by position.", this.tokenAt(el));
            return this.toPattern(el, binding);
          }),
        };
      case "ObjectExpression":
        return {
          type: "ObjectPattern", loc: e.loc, range: e.range,
          properties: e.properties.map((p) => {
            if (p.type === "SpreadElement") this.unsupported("rest properties", "Name each property you need.", this.tokenAt(p));
            if (p.computed) this.unsupported("computed keys in destructuring", "Name each property you need.", this.tokenAt(p));
            return { ...p, key: /** @type {A.Identifier | A.Literal} */ (p.key), value: this.toPattern(p.value, binding), computed: false };
          }),
        };
    }
    throw new SyntaxFailure("P005", "This cannot be assigned to.", "Assign to a variable or a property, like self.x = … or n = ….", e.range[0], e.range[1]);
  }

  /** Targets of `++`, `--` and compound assignment: a name or a property. @param {A.Expression} e @returns {A.Identifier | A.MemberExpression} */
  simpleTarget(e) {
    if (e.type === "Identifier" || (e.type === "MemberExpression" && !e.optional)) return e;
    throw new SyntaxFailure("P005", "This cannot be updated.", "Only a variable or a property can be incremented or updated, like self.ttl--.", e.range[0], e.range[1]);
  }

  /** A token-like span for a node, for error reporting. @param {{ range: [number, number], loc: A.Loc }} n @returns {Token} */
  tokenAt(n) { return { type: "punct", value: "", start: n.range[0], end: n.range[1], loc: n.loc.start, endLoc: n.loc.end, nlBefore: false }; }

  /** A declaration target: a name, or an array or object pattern. @returns {A.Pattern} */
  parseBindingTarget() {
    const t = this.tok;
    if (t.type === "name") { this.advance(); return this.finish(t, /** @type {A.Identifier} */ ({ type: "Identifier", name: t.value })); }
    if (this.is("[")) return this.toPattern(this.parseArray(), true);
    if (this.is("{")) return this.toPattern(this.parseObject(), true);
    return this.unexpected("expected a name or a destructuring pattern");
  }
}
