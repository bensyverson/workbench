// What the glue program's text says before and beside running it: the imports it may not make (C006), found in
// its syntax tree so nothing forbidden is ever loaded, and the handles it tests as values (S301), which a run-time
// trap cannot see.

import { parseModule, walkNodes } from "../../../kit/parse/module.js";
import { GLUE_IMPORTS } from "./hooks.js";

/** Free names that reach Node without an import. */
const ESCAPES = Object.freeze(["process", "require"]);

/**
 * Every import the glue may not make: a static import or re-export of anything but kit/compose, kit/define and the
 * packages' bare names, a dynamic import expression, and a free `process` or `require`. Empty when the text does
 * not parse (loading it then reports why).
 * @param {string} text @param {string[]} packages  the bare names the glue may import
 * @returns {Array<{ line: number, what: string }>}
 */
export function forbiddenReads(text, packages) {
  /** @type {Array<{ line: number, what: string }>} */
  const out = [];
  let tree;
  try { tree = parseModule(text); } catch { return out; }
  const allowed = new Set([...GLUE_IMPORTS, ...packages]);
  /** Names the file declares anywhere: a local `process` is not Node's. @type {Set<string>} */
  const declared = new Set();
  /** @param {any} p */
  const bind = (p) => {
    if (!p) return;
    if (p.type === "Identifier") declared.add(p.name);
    else if (p.type === "ObjectPattern") p.properties.forEach((/** @type {any} */ q) => bind(q.type === "RestElement" ? q.argument : q.value));
    else if (p.type === "ArrayPattern") p.elements.forEach(bind);
    else if (p.type === "AssignmentPattern") bind(p.left);
    else if (p.type === "RestElement") bind(p.argument);
  };
  walkNodes(tree, (/** @type {any} */ n) => {
    if (n.type === "VariableDeclarator") bind(n.id);
    if (n.type === "FunctionDeclaration" || n.type === "FunctionExpression" || n.type === "ArrowFunctionExpression") { bind(n.id); n.params.forEach(bind); }
    if (n.type === "ImportSpecifier" || n.type === "ImportDefaultSpecifier" || n.type === "ImportNamespaceSpecifier") bind(n.local);
    if (n.type === "CatchClause") bind(n.param);
    if (n.type === "ClassDeclaration") bind(n.id);
  });
  /** @param {any} n @param {any} parent */
  const visit = (n, parent) => {
    if (n === null || typeof n !== "object") return;
    if (Array.isArray(n)) { for (const x of n) visit(x, parent); return; }
    if (typeof n.type !== "string") return;
    const line = n.loc?.start.line ?? 1;
    if ((n.type === "ImportDeclaration" || n.type === "ExportNamedDeclaration" || n.type === "ExportAllDeclaration") && n.source && !allowed.has(String(n.source.value))) out.push({ line, what: `imports '${n.source.value}'` });
    if (n.type === "ImportExpression") out.push({ line, what: "uses a dynamic import expression" });
    if (n.type === "Identifier" && ESCAPES.includes(n.name) && !declared.has(n.name)) {
      const property = (parent?.type === "MemberExpression" && parent.property === n && !parent.computed) || ((parent?.type === "Property" || parent?.type === "MethodDefinition" || parent?.type === "PropertyDefinition") && parent.key === n && !parent.computed);
      if (!property) out.push({ line, what: `reads '${n.name}', which reaches Node without an import` });
    }
    for (const [k, v] of Object.entries(n)) if (k !== "loc" && v && typeof v === "object") visit(v, n);
  };
  visit(tree, null);
  return out;
}

/**
 * The handles a condition tests (`if (level.out.picked)`, `!fx.in.burst`, `a && b`): a run-time trap cannot see
 * a test, so the glue's text is read for them.
 * @param {string} text @returns {Array<{ line: number, handle: string }>}
 */
export function conditionReads(text) {
  /** @type {Array<{ line: number, handle: string }>} */
  const out = [];
  let tree;
  try { tree = parseModule(text); } catch { return out; }
  /** @param {any} n */
  const handle = (n) => {
    if (n?.type !== "MemberExpression" || n.computed || n.object?.type !== "MemberExpression" || n.object.computed) return null;
    const side = n.object.property?.name;
    if (!["out", "in", "frame"].includes(side)) return null;
    const base = n.object.object;
    return base?.type === "Identifier" ? `${base.name}.${side}.${n.property.name}` : null;
  };
  /** @param {any} n */
  const test = (n) => { const h = handle(n); if (h) out.push({ line: n.loc.start.line, handle: h }); };
  walkNodes(tree, (/** @type {any} */ n) => {
    if (["IfStatement", "WhileStatement", "DoWhileStatement", "ForStatement", "ConditionalExpression"].includes(n.type)) test(n.test);
    else if (n.type === "UnaryExpression" && n.operator === "!") test(n.argument);
    else if (n.type === "LogicalExpression") { test(n.left); test(n.right); }
  });
  return out;
}
