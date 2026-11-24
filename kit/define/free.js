// The free names a Runtime Lambda reads (the free-name rule, B008): every name it does not bind itself.

/** @import { Node, Pattern, Statement, Expression, ArrowFunctionExpression, Loc } from "../parse/ast.js" */

/**
 * Every name the lambda reads that it does not bind itself (parameters, `const`/`let`, loop variables,
 * nested callbacks' parameters), with the place of its first read. Block scoping is honored: a name bound
 * inside a block is free after it.
 * @param {ArrowFunctionExpression} fn
 * @returns {Array<{ name: string, loc: Loc, member?: string }>}  `member`: the property first read off the name, as in `Math.sin`
 */
export function freeNames(fn) {
  /** @type {Map<string, { loc: Loc, member?: string }>} */
  const free = new Map();

  /** @param {string} name @param {Loc} loc @param {Scope} scope @param {string} [member] */
  const read = (name, loc, scope, member) => {
    for (let s = /** @type {Scope | null} */ (scope); s; s = s.parent) if (s.names.has(name)) return;
    const seen = free.get(name);
    if (!seen) free.set(name, { loc, ...(member ? { member } : {}) });
    else if (member && !seen.member) seen.member = member;
  };

  /** @param {Pattern} p @param {Set<string>} into @param {Scope} scope  defaults are read in `scope` */
  const bind = (p, into, scope) => {
    if (p.type === "Identifier") into.add(p.name);
    else if (p.type === "ObjectPattern") for (const prop of p.properties) bind(prop.value, into, scope);
    else if (p.type === "ArrayPattern") for (const e of p.elements) { if (e) bind(e, into, scope); }
    else if (p.type === "AssignmentPattern") { bind(p.left, into, scope); expr(p.right, scope); }
    else if (p.type === "MemberExpression") expr(p, scope);
  };

  /** @param {ArrowFunctionExpression} f @param {Scope | null} parent */
  const func = (f, parent) => {
    const scope = { names: new Set(/** @type {string[]} */ ([])), parent };
    for (const p of f.params) bind(p, scope.names, scope);
    if (f.body.type === "BlockStatement") block(f.body.body, scope);
    else expr(f.body, scope);
  };

  /** @param {Statement[]} body @param {Scope} parent */
  const block = (body, parent) => {
    const scope = { names: new Set(/** @type {string[]} */ ([])), parent };
    for (const s of body) if (s.type === "VariableDeclaration") for (const d of s.declarations) bind(d.id, scope.names, scope);
    for (const s of body) stmt(s, scope);
  };

  /** @param {Statement} s @param {Scope} scope */
  const stmt = (s, scope) => {
    switch (s.type) {
      case "VariableDeclaration":
        for (const d of s.declarations) { patternReads(d.id, scope); if (d.init) expr(d.init, scope); }
        break;
      case "ExpressionStatement": expr(s.expression, scope); break;
      case "BlockStatement": block(s.body, scope); break;
      case "IfStatement":
        expr(s.test, scope);
        block([s.consequent], scope);
        if (s.alternate) block([s.alternate], scope);
        break;
      case "ForStatement": {
        const inner = { names: new Set(/** @type {string[]} */ ([])), parent: scope };
        if (s.init?.type === "VariableDeclaration") { for (const d of s.init.declarations) bind(d.id, inner.names, inner); stmt(s.init, inner); }
        else if (s.init) expr(s.init, inner);
        if (s.test) expr(s.test, inner);
        if (s.update) expr(s.update, inner);
        block([s.body], inner);
        break;
      }
      case "ForOfStatement": {
        expr(s.right, scope);
        const inner = { names: new Set(/** @type {string[]} */ ([])), parent: scope };
        if (s.left.type === "VariableDeclaration") for (const d of s.left.declarations) bind(d.id, inner.names, inner);
        else expr(/** @type {Expression} */ (s.left), scope);
        block([s.body], inner);
        break;
      }
      case "WhileStatement": case "DoWhileStatement": expr(s.test, scope); block([s.body], scope); break;
      case "ReturnStatement": if (s.argument) expr(s.argument, scope); break;
      default: break;
    }
  };

  /** Defaults inside a declared pattern are reads. @param {Pattern} p @param {Scope} scope */
  const patternReads = (p, scope) => {
    if (p.type === "AssignmentPattern") { patternReads(p.left, scope); expr(p.right, scope); }
    else if (p.type === "ObjectPattern") for (const prop of p.properties) patternReads(prop.value, scope);
    else if (p.type === "ArrayPattern") for (const e of p.elements) { if (e) patternReads(e, scope); }
  };

  /** @param {Node} e @param {Scope} scope */
  const expr = (e, scope) => {
    switch (e.type) {
      case "Identifier": read(e.name, e.loc, scope); break;
      case "ArrowFunctionExpression": func(e, scope); break;
      case "MemberExpression":
        if (e.object.type === "Identifier" && !e.computed && e.property.type === "Identifier") read(e.object.name, e.object.loc, scope, e.property.name);
        else expr(e.object, scope);
        if (e.computed) expr(e.property, scope);
        break;
      case "Property": if (e.computed) expr(/** @type {Expression} */ (e.key), scope); expr(e.value, scope); break;
      case "ObjectPattern": case "ArrayPattern": case "AssignmentPattern": {
        // An assignment target pattern writes names it does not declare: each is a read of a free name.
        /** @type {Set<string>} */
        const names = new Set();
        bind(/** @type {Pattern} */ (e), names, scope);
        for (const n of names) read(n, e.loc, scope);
        break;
      }
      default:
        for (const [k, v] of Object.entries(e)) {
          if (k === "loc" || k === "range") continue;
          if (Array.isArray(v)) { for (const x of v) if (isNode(x)) expr(x, scope); }
          else if (isNode(v)) expr(v, scope);
        }
    }
  };

  func(fn, null);
  return [...free].map(([name, v]) => ({ name, ...v }));
}

/** @typedef {{ names: Set<string>, parent: Scope | null }} Scope */

/** @param {unknown} v @returns {v is Node} */
const isNode = (v) => v !== null && typeof v === "object" && typeof (/** @type {{ type?: unknown }} */ (v)).type === "string";
