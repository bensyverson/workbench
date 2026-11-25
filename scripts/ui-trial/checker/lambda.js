// A UI lambda's checks (U007): it parses as one arrow in the Runtime Subset, takes no more parameters than its
// convention, is pure (assigns only its own let locals), reads only declared members of the state (and of a
// table's row), and reads no free name but the Dialect's globals, intrinsics, library and vector types.
// Its result's type is not checked: the kit's lowering will do that (ui-draft.md, pitfall 7).

import { parseLambda, checkSubset } from "../../../kit/parse/index.js";
import { resolveChain, LEAVES } from "./shapes.js";
import { didYouMean } from "../../../kit/define/index.js";

/** @import { Shape } from "./shapes.js" */

/**
 * @typedef {object} LambdaContext
 * @property {string[]} params      the convention's parameter names, for messages: ["s", "$"] or ["row", "s", "$"]
 * @property {Array<Shape | null>} shapes  per parameter, the shape its members are checked against (null: any member)
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
        if (n.type === "AssignmentExpression") visit(n.right);
        return;
      }
      case "MemberExpression": {
        const chain = chainOf(n);
        const rootName = chain?.root.name ?? "";
        if (chain && !paramIndex.has(rootName) && !locals.has(rootName) && ctx.objects && Object.hasOwn(ctx.objects, rootName)) {
          const p = globalChain(rootName, ctx.objects[rootName], chain.segs);
          if (p) out.push({ line: line(n), ...p });
          visit(chain.computed);
          return;
        }
        if (chain && paramIndex.has(chain.root.name)) {
          const i = /** @type {number} */ (paramIndex.get(chain.root.name));
          const shape = ctx.shapes[i];
          if (shape) {
            const p = resolveChain(shape, chain.root.name, chain.segs);
            if (p) out.push({ line: line(n), message: `${p} (the declared state)`, fix: "read only what `state` declares, or declare it there" });
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
          if (shape && !LEAVES.includes(shape.kind)) out.push({ line: line(n), message: `'${n.name}' is used whole; the state is read only as ${n.name}.member`, fix: `read the member you need: ${n.name}.<member>` });
          return;
        }
        if (locals.has(n.name) || ctx.free.has(n.name)) return;
        out.push({ line: line(n), message: `'${n.name}' is not a name a view's lambda may read`, fix: `use the lambda's parameters (${conv}), its locals, or what the Dialect gives: ${[...ctx.free].sort().join(", ") || "nothing"}` });
        return;
      }
      case "Property":
        if (n.computed) visit(n.key);
        visit(n.value);
        return;
      case "VariableDeclarator":
        visit(n.init);
        return;
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
