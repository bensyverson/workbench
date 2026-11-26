// A UI lambda's checks (U007): it parses as one arrow in the Runtime Subset, takes no more parameters than its
// convention, is pure (assigns only its own let locals), reads only declared members of the state (and of a
// table's row), and reads no free name but the Dialect's globals, intrinsics, library and vector types.
// The reads are checked structurally, so no Program or lowering is needed: every member chain starts at a
// parameter or a Dialect global (never a local, a conditional, a call, an array), and a local never holds what a
// parameter gave it, so every read of the state is one chain the declared Type resolves.
// Its result's type is not checked: the kit's lowering will do that (ui-draft.md, pitfall 7).

import { parseLambda, checkSubset } from "../../parse/index.js";
import { resolveChain, chainType, isScalarType, kindOf, LEAVES, openListAt } from "./shapes.js";
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
  /**
   * What a name is in the scope where it is read: a parameter (`i` its position), or a local with its keyword. `typed` is
   * set on a const that is exactly a member chain from a parameter: its `type` (null when the root has no shape, like `$`)
   * is what chains rooted at it are checked against. `held` marks a local already refused for holding state, so a read off
   * it is not refused a second time. `open` marks a value computed from the length of a list with no max.
   * @typedef {{ kw: "param" | "arg" | "const" | "let", i?: number, typed?: boolean, type?: Type | null, held?: boolean, open?: boolean, site?: string }} Binding
   */
  /** @type {Array<Map<string, Binding>>} */
  const scopes = [new Map()];
  params.forEach((p, i) => { if (p.type === "Identifier") scopes[0].set(p.name, { kw: "param", i }); });
  /** @param {string} name @returns {Binding | undefined} */
  const lookup = (name) => { for (let i = scopes.length - 1; i >= 0; i--) { const b = scopes[i].get(name); if (b) return b; } return undefined; };
  /** @param {string} name @param {Binding} b */
  const declare = (name, b) => { scopes[scopes.length - 1].set(name, b); };
  /** Declarations (by position and name) found open on an earlier pass: a loop-carried value is open before the loop that reads it. @type {Set<string>} */
  const openSites = new Set();
  /** @param {any} d @param {string} name */
  const siteOf = (d, name) => `${d.loc.start.line}:${d.loc.start.column}:${name}`;
  /** @param {any[]} decls names a block's own declarations before they are reached, so a closure may read one declared below it */
  const hoist = (decls) => { for (const st of decls) if (st?.type === "VariableDeclaration") for (const d of st.declarations) for (const name of bound(d.id)) { const site = siteOf(d, name); declare(name, { kw: st.kind, site, open: openSites.has(site) }); } };
  /** @param {() => void} f runs `f` in a new scope */
  const scoped = (f) => { scopes.push(new Map()); try { f(); } finally { scopes.pop(); } };

  const line = (/** @type {any} */ n) => n.loc.start.line;
  /** Whether a name, as read here, is the run's data: a parameter, a const typed by a parameter chain, or `$` as a Dialect global. @param {string} name */
  const isData = (name) => { const b = lookup(name); return b ? b.kw === "param" || !!b.typed : name === "$" && ctx.free.has("$"); };
  /** The Type a data name's chains are checked against, or null (any member). @param {Binding | undefined} b @returns {Type | null} */
  const shapeOf = (b) => (b?.kw === "param" ? ctx.shapes[/** @type {number} */ (b.i)] : b?.typed ? b.type ?? null : null);
  /** The first data name a subtree reads, or null: a read is an identifier that is not a member name or an object key. @param {any} n @returns {string | null} */
  const readsData = (n) => {
    if (!n || typeof n !== "object") return null;
    if (Array.isArray(n)) { for (const c of n) { const r = readsData(c); if (r) return r; } return null; }
    if (n.type === "Identifier") return isData(n.name) ? n.name : null;
    for (const [k, v] of Object.entries(n)) {
      if (k === "loc" || k === "range" || k === "type") continue;
      if (n.type === "MemberExpression" && k === "property" && !n.computed) continue;
      if (n.type === "Property" && k === "key" && !n.computed) continue;
      const r = readsData(v);
      if (r) return r;
    }
    return null;
  };
  /**
   * Whether a value holds a struct, list, optional or vector of the state: directly a member chain (or a conditional or
   * logical of them) whose Type is not a plain value, or a data name used whole. Arithmetic, comparisons, calls and literals
   * are scalars. A chain whose Type is unknown (`$`) or does not resolve (said where it is read) counts as one.
   * @param {any} e @returns {boolean}
   */
  const holdsStruct = (e) => {
    if (!e) return false;
    if (e.type === "ConditionalExpression") return holdsStruct(e.consequent) || holdsStruct(e.alternate);
    if (e.type === "LogicalExpression") return holdsStruct(e.left) || holdsStruct(e.right);
    if (e.type === "Identifier") {
      if (!isData(e.name)) return false;
      const b = lookup(e.name);
      if (!b && e.name === "$") return true;
      const shape = shapeOf(b);
      return shape ? !isScalarType(shape) : b?.kw === "param";
    }
    if (e.type === "MemberExpression") {
      const c = chainOf(e);
      if (!c || !isData(c.root.name)) return false;
      const shape = shapeOf(lookup(c.root.name));
      if (!shape) return false;
      const r = chainType(shape, c.root.name, c.segs, ctx.aliases);
      return "type" in r && !isScalarType(r.type);
    }
    return false;
  };
  /** Whether a value is computed from the length or an item of a list with no max, directly or through a local that was. @param {any} e */
  const touchesOpen = (e) => {
    let hit = false;
    walk(e, (m) => {
      if (m.type === "Identifier" && lookup(m.name)?.open) hit = true;
      if (m.type !== "MemberExpression") return;
      const c = chainOf(m);
      const shape = c && isData(c.root.name) ? shapeOf(lookup(c.root.name)) : null;
      if (c && shape && c.segs.at(-1) === "length" && openListAt(shape, c.segs.slice(0, -1), ctx.aliases)) hit = true;
    });
    return hit;
  };
  /** A local set to what holds state: a struct, list or optional of it. @param {any} at @param {string[]} names @param {string} from */
  const holdsState = (at, names, from) => { for (const x of names) { const b = lookup(x); if (b) b.held = true; } const what = `the local${names.length > 1 ? "s" : ""} ${names.map((/** @type {string} */ x) => `'${x}'`).join(", ")}`; out.push({ line: line(at), message: `${what} is set from ${from}; a UI lambda may not hold state in a local`, fix: `read ${from}.member where you use it, e.g. s.bounds.width; or set a const to exactly one member chain, const b = s.bodies[0], and read b.member` }); };
  /** Chains that may end at a list with no max: a const's initializer, which then holds the list. @type {Set<any>} */
  const allowOpenEnd = new Set();
  /** @param {any} n */
  function visit(n) {
    if (!n || typeof n !== "object") return;
    if (Array.isArray(n)) { n.forEach(visit); return; }
    switch (n.type) {
      case "BlockStatement":
        scoped(() => { hoist(n.body); visit(n.body); });
        return;
      case "ArrowFunctionExpression": case "FunctionExpression":
        scoped(() => {
          for (const p of n.params) for (const name of bound(p)) declare(name, { kw: "arg" });
          visit(n.params);
          visit(n.body);
        });
        return;
      case "AssignmentExpression":
      case "UpdateExpression": {
        const target = n.type === "UpdateExpression" ? n.argument : n.left;
        const tb = target.type === "Identifier" ? lookup(target.name) : undefined;
        if (!tb || tb.kw !== "let") {
          const what = target.type === "Identifier"
            ? (tb?.kw === "param" ? `the parameter '${target.name}'` : tb?.kw === "const" ? `the const '${target.name}'` : `'${target.name}'`)
            : "the state or the params";
          out.push({ line: line(n), message: `the lambda assigns ${what}; a view's lambda assigns only its own let locals`, fix: "compute into a let local; a view never changes the run" });
        }
        if (target.type !== "Identifier") visit(target);
        if (n.type === "AssignmentExpression") {
          if (tb?.kw === "let") {
            if (holdsStruct(n.right) && !tb.held) holdsState(n, [target.name], readsData(n.right) ?? "the state");
            if (touchesOpen(n.right)) { tb.open = true; if (tb.site) openSites.add(tb.site); }
          }
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
        const rb = lookup(rootName);
        if (rb && rb.kw !== "param" && !rb.typed) {
          if (!rb.held) out.push({ line: line(n), message: `a member is read off the local '${rootName}'; a read must start at a parameter or a Dialect global`, fix: `write the chain from the parameter, e.g. s.bounds.width, or set a const to exactly one member chain (const b = s.bodies[0]) and read b.member` });
          visit(chain.computed);
          return;
        }
        if (!rb && ctx.objects && Object.hasOwn(ctx.objects, rootName)) {
          const p = globalChain(rootName, ctx.objects[rootName], chain.segs);
          if (p) out.push({ line: line(n), ...p });
          visit(chain.computed);
          return;
        }
        if (rb) {
          const shape = shapeOf(rb);
          if (shape) {
            const p = resolveChain(shape, rootName, chain.segs, ctx.aliases);
            if (p) out.push({ line: line(n), message: `${p} (the declared state)`, fix: "read only what `state` declares, or declare it there" });
            else if (!allowOpenEnd.has(n) && openListAt(shape, chain.segs, ctx.aliases)) out.push({ line: line(n), message: `${rootName}${chain.segs.map((x) => (x === "[]" ? "[…]" : `.${x}`)).join("")} is a list with no declared max; a UI lambda reads its length and items by index, and takes nothing else of it`, fix: "read .length or one item, s.list[0].member; show every item in a table" });
          }
          visit(chain.computed);
          return;
        }
        visit(n.object);
        if (n.computed) visit(n.property);
        return;
      }
      case "Identifier": {
        const b = lookup(n.name);
        if (b && (b.kw === "param" || b.typed)) {
          const shape = shapeOf(b);
          // A leaf (a table over a list of strings hands the row itself) may be used whole; the state and an object row may not.
          if (b.kw === "param" && shape && !LEAVES.includes(kindOf(shape))) out.push({ line: line(n), message: `'${n.name}' is used whole; the state is read only as ${n.name}.member`, fix: `read the member you need: ${n.name}.<member>` });
          // A const holding a struct or an optional may be tested (`b != null`); one holding a list with no max may not be used whole.
          if (b.typed && shape && openListAt(shape, [], ctx.aliases)) out.push({ line: line(n), message: `${n.name} is a list with no declared max; a UI lambda reads its length and items by index, and takes nothing else of it`, fix: `read ${n.name}.length or one item, ${n.name}[0].member` });
          return;
        }
        if (b || ctx.free.has(n.name)) return;
        out.push({ line: line(n), message: `'${n.name}' is not a name a view's lambda may read`, fix: `use the lambda's parameters (${conv}), its locals, or what the Dialect gives: ${[...ctx.free].sort().join(", ") || "nothing"}` });
        return;
      }
      case "ForStatement": case "ForOfStatement": case "ForInStatement":
        scoped(() => {
          hoist([n.init]);
          // A loop over a list with no declared max has no bound the kit can state: the header may not read one.
          for (const head of [n.init, n.test, n.update, n.left, n.right]) {
            if (!head) continue;
            walk(head, (m) => {
              if (m.type === "Identifier" && lookup(m.name)?.open) out.push({ line: line(m), message: `a loop is bounded by '${m.name}', which is computed from a list with no declared max; a UI lambda never loops over one`, fix: "read its length or one item by index, outside a loop" });
              if (m.type !== "MemberExpression") return;
              const c = chainOf(m);
              if (c && isData(c.root.name) && c.segs.at(-1) === "length") {
                const shape = shapeOf(lookup(c.root.name));
                if (shape && openListAt(shape, c.segs.slice(0, -1), ctx.aliases)) out.push({ line: line(m), message: `a loop is bounded by ${c.root.name}${c.segs.slice(0, -1).map((x) => (x === "[]" ? "[…]" : `.${x}`)).join("")}.length, a list with no declared max; a UI lambda never loops over one`, fix: "read its length or one item by index, outside a loop" });
              }
            });
          }
          if (n.type === "ForOfStatement" && n.left.type === "VariableDeclaration") {
            const names = n.left.declarations.flatMap((/** @type {any} */ d) => bound(d.id));
            for (const name of names) declare(name, { kw: n.left.kind });
            const from = readsData(n.right);
            if (from) holdsState(n.left, names, from);
          }
          for (const [k, v] of Object.entries(n)) if (k !== "loc" && k !== "range" && k !== "type" && !(n.type === "ForOfStatement" && k === "left")) visit(v);
        });
        return;
      case "Property":
        if (n.computed) visit(n.key);
        visit(n.value);
        return;
      case "VariableDeclarator": {
        const kw = /** @type {"const" | "let"} */ (lookup(bound(n.id)[0])?.kw ?? "let");
        const names = bound(n.id);
        const init = n.init;
        const c = init?.type === "MemberExpression" ? chainOf(init) : null;
        const rootBinding = c ? lookup(c.root.name) : undefined;
        const fromChain = n.id.type === "Identifier" && kw === "const" && c && (rootBinding ? rootBinding.kw === "param" || !!rootBinding.typed : c.root.name === "$" && ctx.free.has("$") && !ctx.objects?.$);
        if (fromChain) allowOpenEnd.add(init);
        visit(init);
        if (fromChain && c) {
          // Exactly a member chain from a parameter: the const takes the Type the chain resolves to (null: unchecked, like `$`).
          const shape = shapeOf(rootBinding);
          const r = shape ? chainType(shape, c.root.name, c.segs, ctx.aliases) : null;
          declare(names[0], { kw: "const", typed: true, type: r && "type" in r ? r.type : null, open: touchesOpen(init) });
        } else {
          const bad = readsData(init) && (n.id.type !== "Identifier" || holdsStruct(init));
          for (const name of names) { const site = siteOf(n, name); declare(name, { kw, site, open: touchesOpen(init) || openSites.has(site) }); if (touchesOpen(init)) openSites.add(site); }
          if (bad) holdsState(n, names, /** @type {string} */ (readsData(init)));
        }
        return;
      }
      default:
        for (const [k, v] of Object.entries(n)) if (k !== "loc" && k !== "range" && k !== "type") visit(v);
    }
  }
  // Run to a fixpoint: a let found open late (assigned below the loop that reads it) seeds the next pass.
  for (let before = -1; before !== openSites.size;) { before = openSites.size; out.length = 0; visit(ast.body); }
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
