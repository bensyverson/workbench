// Where a lambda or helper touches a total, read from its syntax tree: a total (`bump: true`) changes only by the
// statement `x.m += e` or `x.m++` (a bump); any other change is L017 at once; anything else is a read. The IR cannot
// tell these apart (a bump lowers as a read and a write), so this is the checker's, until the kit has a bump.
// A total reached through another name (`const c = totals; c.n++`) is not seen here; check.js catches its write.

import { parseLambda } from "../../../../kit/parse/index.js";

/** @import { Loc } from "../../../../kit/parse/ast.js" */

/**
 * @typedef {object} TotalSite
 * @property {"bump" | "read" | "bad"} kind
 * @property {string} object  the total's object
 * @property {string} member
 * @property {string} text  how the source names it (`totals.harvest`)
 * @property {Loc} loc  in the lambda's source
 * @property {string} [why]  for "bad": what the change was
 */

/**
 * Every place a lambda's source touches a total.
 * @param {string} src  the lambda's (or helper's) source
 * @param {{ globals: Record<string, string>, params: Array<string | null> }} receivers  the globals that hold an object
 *   with totals, with that object, and the object each parameter holds, by position (null for one that holds none)
 * @param {(object: string) => Set<string>} totalsOf  an object's totals
 * @returns {TotalSite[]}
 */
export function totalSites(src, receivers, totalsOf) {
  const parsed = parseLambda(src);
  if (!parsed.ok) return [];
  const ast = /** @type {any} */ (parsed.ast);
  /** @type {Record<string, string>} */
  const names = { ...receivers.globals };
  // a parameter shadows a global of the same name
  ast.params.forEach((/** @type {any} */ p, /** @type {number} */ i) => {
    if (p.type !== "Identifier") return;
    const held = receivers.params[i];
    if (held) names[p.name] = held;
    else delete names[p.name];
  });
  /** @type {TotalSite[]} */
  const out = [];
  /** @param {any} node @param {any[]} parents */
  const walk = (node, parents) => {
    if (node === null || typeof node !== "object") return;
    if (Array.isArray(node)) { for (const n of node) walk(n, parents); return; }
    if (typeof node.type !== "string") return;
    if (node.type === "MemberExpression" && !node.computed && node.object.type === "Identifier" && Object.hasOwn(names, node.object.name) && node.property.type === "Identifier") {
      const object = names[node.object.name], member = node.property.name;
      if (totalsOf(object).has(member)) out.push(classify(node, parents, object, member, `${node.object.name}.${member}`));
    }
    for (const [k, v] of Object.entries(node)) if (k !== "loc" && k !== "range") walk(v, [...parents, node]);
  };
  walk(ast.body, [ast]);
  return out;
}

/**
 * @param {any} node @param {any[]} parents @param {string} object @param {string} member @param {string} text
 * @returns {TotalSite}
 */
function classify(node, parents, object, member, text) {
  const parent = parents.at(-1), statement = parents.at(-2);
  const asStatement = statement?.type === "ExpressionStatement" && statement.expression === parent;
  const site = { object, member, text, loc: node.loc };
  if (parent?.type === "AssignmentExpression" && parent.left === node) {
    if (parent.operator === "+=" && asStatement) return { ...site, kind: "bump" };
    return { ...site, kind: "bad", loc: parent.loc, why: parent.operator === "+=" ? "a bump used as a value" : `changed with '${parent.operator}'` };
  }
  if (parent?.type === "UpdateExpression") {
    if (parent.operator === "++" && asStatement) return { ...site, kind: "bump" };
    return { ...site, kind: "bad", loc: parent.loc, why: parent.operator === "++" ? "a bump used as a value" : `changed with '${parent.operator}'` };
  }
  return { ...site, kind: "read" };
}
