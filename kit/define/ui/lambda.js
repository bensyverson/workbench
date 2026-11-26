// A UI lambda's checks (U007): it parses as one arrow in the Runtime Subset, takes no more parameters than its
// convention, is pure (assigns only its own let locals), reads only declared members of the state (and of a
// table's row), and reads no free name but the Dialect's globals, intrinsics, library and vector types.
// The reads are checked structurally, so no Program or lowering is needed: every member chain starts at a
// parameter or a Dialect global (never a local, a conditional, a call, an array), and a local never holds what a
// parameter gave it, so every read of the state is one chain the declared Type resolves.
// Its result's type is not checked: the kit's lowering will do that (ui-draft.md, pitfall 7).

import { parseLambda, checkSubset } from "../../parse/index.js";
import { resolveChain, kindOf, LEAVES, openListAt } from "./shapes.js";
import { didYouMean } from "../codes.js";

/** @import { Type } from "../../ir/ir.js" */

/**
 * @typedef {object} LambdaContext
 * @property {string[]} params      the convention's parameter names, for messages: ["s", "$"] or ["row", "s", "$"]
 * @property {Array<Type | null>} shapes  per parameter, the Type its members are checked against (null: any member)
 * @property {Record<string, Record<string, string>>} aliases  the Dialect's vector component aliases, by vector name
 * @property {Set<string>} free     the free names the Dialect gives
 * @property {Record<string, any>} [objects]  the Dialect objects its globals name, by global name (`Math` to Math's definition)
 */

/** A problem inside a lambda: the line within it (1-based) and what. */
/** @typedef {{ line: number, message: string, fix: string }} LambdaProblem */

/**
 * @param {Function} fn @param {LambdaContext} ctx @returns {LambdaProblem[]}
 */
export function checkLambda(fn, ctx) {
  const src = String(fn);
  const conv = `(${ctx.params.join(", ")}) => …`;
  const parsed = parseLambda(src);
  if (!parsed.ok || !parsed.ast) {
    const d = parsed.diagnostics[0];
    return [{ line: d.loc.start.line, message: `the lambda does not parse as one arrow function: ${d.code} ${d.message}`, fix: `write an arrow function, ${conv}` }];
  }
  const ast = parsed.ast;
  /** @type {LambdaProblem[]} */
  const out = checkSubset(ast, src).filter((d) => d.severity === "error")
    .map((d) => ({ line: d.loc.start.line, message: `${d.code} ${d.message}`, fix: d.tip || "stay inside the Runtime Subset" }));
  if (out.length) return out;

  const params = /** @type {any[]} */ (ast.params);
  if (params.length > ctx.params.length) {
    out.push({ line: 1, message: `the lambda takes ${params.length} parameters; its convention is ${conv}`, fix: `take at most ${ctx.params.length}: ${conv}` });
    return out;
  }
  const pattern = params.find((p) => p.type !== "Identifier");
  if (pattern) {
    out.push({ line: pattern.loc.start.line, message: `a lambda parameter is the whole ${ctx.params[params.indexOf(pattern)]}, written as one name; a destructuring pattern is not allowed`, fix: `name the parameter (${conv}) and read a member as ${ctx.params[params.indexOf(pattern)]}.member` });
    return out;
  }
  /** Parameter name → its position. @type {Map<string, number>} */
  const paramIndex = new Map();
  params.forEach((p, i) => { if (p.type === "Identifier") paramIndex.set(p.name, i); });

  // Locals: every name a declaration binds, with its keyword (a lexical scan; the subset forbids shadowing tricks).
  /** @type {Map<string, string>} */
  const locals = new Map();
  walk(ast.body, (n) => {
    if (n.type === "VariableDeclaration") for (const d of n.declarations) for (const name of bound(d.id)) locals.set(name, n.kind);
  });

  const line = (/** @type {any} */ n) => n.loc.start.line;
  /** The names whose reads are the run's data: the parameters, and `$` where the Dialect gives it as a global. */
  const dataNames = new Set([...paramIndex.keys(), ...(ctx.free.has("$") ? ["$"] : [])]);
  /** The first parameter a subtree reads, or null: a read is an identifier that is not a member name or an object key. @param {any} n @returns {string | null} */
  const readsData = (n) => {
    if (!n || typeof n !== "object") return null;
    if (Array.isArray(n)) { for (const c of n) { const r = readsData(c); if (r) return r; } return null; }
    if (n.type === "Identifier") return dataNames.has(n.name) ? n.name : null;
    for (const [k, v] of Object.entries(n)) {
      if (k === "loc" || k === "range" || k === "type") continue;
      if (n.type === "MemberExpression" && k === "property" && !n.computed) continue;
      if (n.type === "Property" && k === "key" && !n.computed) continue;
      const r = readsData(v);
      if (r) return r;
    }
    return null;
  };
  /** A local set from a parameter: what it holds is state, and a read through it cannot be checked against the state's Type. @param {any} at @param {string[]} names @param {string} from */
  const holdsState = (at, names, from) => { for (const x of names) held.add(x); const what = `the local${names.length > 1 ? "s" : ""} ${names.map((/** @type {string} */ x) => `'${x}'`).join(", ")}`; out.push({ line: line(at), message: `${what} is set from ${from}; a UI lambda may not hold state in a local`, fix: `read ${from}.member where you use it, e.g. s.bounds.width, and keep locals for plain values such as a constant` }); };
  /** Locals already refused for holding state: a read off one is not refused a second time. @type {Set<string>} */
  const held = new Set();
  /** @param {any} n */
  function visit(n) {
    if (!n || typeof n !== "object") return;
    if (Array.isArray(n)) { n.forEach(visit); return; }
    switch (n.type) {
      case "AssignmentExpression":
      case "UpdateExpression": {
        const target = n.type === "UpdateExpression" ? n.argument : n.left;
        if (target.type !== "Identifier" || locals.get(target.name) !== "let") {
          const what = target.type === "Identifier"
            ? (paramIndex.has(target.name) ? `the parameter '${target.name}'` : locals.has(target.name) ? `the const '${target.name}'` : `'${target.name}'`)
            : "the state or the params";
          out.push({ line: line(n), message: `the lambda assigns ${what}; a view's lambda assigns only its own let locals`, fix: "compute into a let local; a view never changes the run" });
        }
        if (target.type !== "Identifier") visit(target);
        if (n.type === "AssignmentExpression") {
          const from = target.type === "Identifier" && locals.get(target.name) === "let" ? readsData(n.right) : null;
          if (from && !held.has(target.name)) holdsState(n, [target.name], from);
          visit(n.right);
        }
        return;
      }
      case "MemberExpression": {
        const chain = chainOf(n);
        if (!chain) {
          let root = n;
          while (root.type === "MemberExpression") { if (root.computed) visit(root.property); root = root.object; }
          out.push({ line: line(n), message: `a member is read off ${describeRoot(root)}; a read must start at a parameter or a Dialect global`, fix: "write the chain from the parameter, e.g. s.bounds.width; a computed value has no members to read" });
          visit(root);
          return;
        }
        const rootName = chain.root.name;
        if (locals.has(rootName) && !paramIndex.has(rootName)) {
          if (!held.has(rootName)) out.push({ line: line(n), message: `a member is read off the local '${rootName}'; a read must start at a parameter or a Dialect global`, fix: `write the chain from the parameter, e.g. s.bounds.width; a UI lambda may not hold state in a local` });
          visit(chain.computed);
          return;
        }
        if (!paramIndex.has(rootName) && ctx.objects && Object.hasOwn(ctx.objects, rootName)) {
          const p = globalChain(rootName, ctx.objects[rootName], chain.segs);
          if (p) out.push({ line: line(n), ...p });
          visit(chain.computed);
          return;
        }
        if (paramIndex.has(chain.root.name)) {
          const i = /** @type {number} */ (paramIndex.get(chain.root.name));
          const shape = ctx.shapes[i];
          if (shape) {
            const p = resolveChain(shape, chain.root.name, chain.segs, ctx.aliases);
            if (p) out.push({ line: line(n), message: `${p} (the declared state)`, fix: "read only what `state` declares, or declare it there" });
            else if (openListAt(shape, chain.segs, ctx.aliases)) out.push({ line: line(n), message: `${chain.root.name}${chain.segs.map((x) => (x === "[]" ? "[…]" : `.${x}`)).join("")} is a list with no declared max; a UI lambda reads its length and items by index, and takes nothing else of it`, fix: "read .length or one item, s.list[0].member; show every item in a table" });
          }
          visit(chain.computed);
          return;
        }
        visit(n.object);
        if (n.computed) visit(n.property);
        return;
      }
      case "Identifier": {
        const i = paramIndex.get(n.name);
        if (i !== undefined) {
          const shape = ctx.shapes[i];
          // A leaf (a table over a list of strings hands the row itself) may be used whole; the state and an object row may not.
          if (shape && !LEAVES.includes(kindOf(shape))) out.push({ line: line(n), message: `'${n.name}' is used whole; the state is read only as ${n.name}.member`, fix: `read the member you need: ${n.name}.<member>` });
          return;
        }
        if (locals.has(n.name) || ctx.free.has(n.name)) return;
        out.push({ line: line(n), message: `'${n.name}' is not a name a view's lambda may read`, fix: `use the lambda's parameters (${conv}), its locals, or what the Dialect gives: ${[...ctx.free].sort().join(", ") || "nothing"}` });
        return;
      }
      case "ForStatement": case "ForOfStatement": case "ForInStatement": {
        // A loop over a list with no declared max has no bound the kit can state: the header may not read one.
        for (const head of [n.init, n.test, n.update, n.left, n.right]) {
          if (!head) continue;
          walk(head, (m) => {
            if (m.type !== "MemberExpression") return;
            const c = chainOf(m);
            if (c && paramIndex.has(c.root.name) && c.segs.at(-1) === "length") {
              const shape = ctx.shapes[/** @type {number} */ (paramIndex.get(c.root.name))];
              if (shape && openListAt(shape, c.segs.slice(0, -1), ctx.aliases)) out.push({ line: line(m), message: `a loop is bounded by ${c.root.name}${c.segs.slice(0, -1).map((x) => (x === "[]" ? "[…]" : `.${x}`)).join("")}.length, a list with no declared max; a UI lambda never loops over one`, fix: "read its length or one item by index, outside a loop" });
            }
          });
        }
        if (n.type === "ForOfStatement" && n.left.type === "VariableDeclaration") {
          const from = readsData(n.right);
          if (from) holdsState(n.left, n.left.declarations.flatMap((/** @type {any} */ d) => bound(d.id)), from);
        }
        for (const [k, v] of Object.entries(n)) if (k !== "loc" && k !== "range" && k !== "type") visit(v);
        return;
      }
      case "Property":
        if (n.computed) visit(n.key);
        visit(n.value);
        return;
      case "VariableDeclarator": {
        const from = readsData(n.init);
        if (from) holdsState(n, bound(n.id), from);
        visit(n.init);
        return;
      }
      default:
        for (const [k, v] of Object.entries(n)) if (k !== "loc" && k !== "range" && k !== "type") visit(v);
    }
  }
  visit(ast.body);
  return out;
}

/**
 * What a read of `global.member…` gets wrong, against the Dialect object the global names: a rejected member says why,
 * a member the object declares nothing of is unknown. An object that declares no members (its members are filled in per
 * program, like `counters` and `$`) is not checked for unknown members.
 * @param {string} name @param {any} obj @param {string[]} segs
 * @returns {{ message: string, fix: string } | null}
 */
function globalChain(name, obj, segs) {
  const seg = segs[0];
  if (seg === undefined) return null;
  const rejected = obj?.rejected ?? {};
  const members = Object.keys(obj?.members ?? {});
  if (seg === "[]") return members.length || Object.keys(rejected).length ? { message: `${name} is an object; read its members by name (${name}.member), not by a computed key`, fix: `write ${name}.<member>: ${members.join(", ")}` } : null;
  if (Object.hasOwn(rejected, seg)) {
    const r = rejected[seg];
    return { message: `${name}.${seg} is not offered: ${r.message}`, fix: r.tip || (r.fix ? `write ${r.fix}` : `use one of: ${members.join(", ")}`) };
  }
  if (members.length && !members.includes(seg)) return { message: `${name} has no member '${seg}'.${didYouMean(seg, members)}`, fix: `use one of: ${members.join(", ")}` };
  return null;
}

/** What a chain's root expression is, for a message. @param {any} n */
function describeRoot(n) {
  const kinds = /** @type {Record<string, string>} */ ({ ConditionalExpression: "a conditional", LogicalExpression: "a logical expression", CallExpression: "a call's result", ArrayExpression: "an array", BinaryExpression: "a computed value", ObjectExpression: "an object literal", Literal: "a literal", TemplateLiteral: "a template", ThisExpression: "this" });
  return kinds[n.type] ?? "an expression";
}

/**
 * The member chain under `n`, rooted at an identifier: `s.a[i].b` gives segs ["a", "[]", "b"].
 * @param {any} n @returns {{ root: { name: string }, segs: string[], computed: any[] } | null}
 */
function chainOf(n) {
  const segs = [];
  const computed = [];
  let cur = n;
  while (cur.type === "MemberExpression") {
    if (cur.computed) { segs.unshift("[]"); computed.push(cur.property); } else segs.unshift(cur.property.name);
    cur = cur.object;
  }
  return cur.type === "Identifier" ? { root: cur, segs, computed } : null;
}

/** The names a pattern binds. @param {any} p @returns {string[]} */
function bound(p) {
  if (!p) return [];
  if (p.type === "Identifier") return [p.name];
  if (p.type === "ObjectPattern") return p.properties.flatMap((/** @type {any} */ q) => bound(q.value));
  if (p.type === "ArrayPattern") return p.elements.flatMap(bound);
  if (p.type === "AssignmentPattern") return bound(p.left);
  return [];
}

/** Calls `f` on every node under `n`. @param {any} n @param {(n: any) => void} f */
function walk(n, f) {
  if (!n || typeof n !== "object") return;
  if (Array.isArray(n)) { for (const c of n) walk(c, f); return; }
  if (typeof n.type === "string") f(n);
  for (const [k, v] of Object.entries(n)) if (k !== "loc" && k !== "range") walk(v, f);
}
