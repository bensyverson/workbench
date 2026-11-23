// Lowering calls: dialect functions, keyed functions (`w.param("x")`), emits, the
// program's own methods, and callable handles like the HUD's `at`.

import { assignable, showType, unify, substitute } from "../ir/types.js";
import { didYouMean } from "./codes.js";
import { query } from "./query.js";
import { expr, check, mismatch, bad, seq, resolveOn, spanOf, computed } from "./expr.js";

/** @import * as AST from "../parse/ast.js" */
/** @import { Type, Expr, Effect } from "../ir/ir.js" */
/** @import { FnSig } from "./dialect.js" */
/** @import { Lowerer } from "./lowerer.js" */
/** @import { Resolved } from "./expr.js" */

/**
 * Lowers a call: a query, a dialect function, a keyed function, an emit, or a program method.
 * @param {Lowerer} L
 * @param {AST.CallExpression} node
 * @returns {Expr}
 */
export function call(L, node) {
  const callee = node.callee;
  const args = /** @type {AST.Expression[]} */ (node.arguments);
  const noCallbacks = () => {
    for (const a of args) if (a.type === "ArrowFunctionExpression") L.error("L005", a, "A callback is allowed only as the argument of a declared query.", `Callbacks are allowed only in ${L.dialect.queries.join(", ")}.`);
  };
  if (callee.type === "Identifier") {
    const f = expr(L, callee);
    const o = typeof f.t === "object" && "obj" in f.t ? L.dialect.objects[f.t.obj] : undefined;
    if (f.t === "unknown") return bad(node);
    if (!o?.call) { L.error("L003", callee, `'${callee.name}' is not a function.`, "Call only dialect functions and methods."); return bad(node); }
    noCallbacks();
    const typeName = /** @type {{ obj: string }} */ (f.t).obj;
    return withSig(L, node, o.call, typeName, f, args, o.call.effects, callee.name);
  }
  if (callee.type !== "MemberExpression") { L.error("L003", callee, "This is not a function.", "Call only dialect functions and methods."); return bad(node); }
  const recv = expr(L, callee.object);
  if (callee.computed) { computed(L, recv, callee); return bad(node); }
  const name = /** @type {AST.Identifier} */ (callee.property).name;
  if (typeof recv.t === "object" && "list" in recv.t && /** @type {string[]} */ (L.dialect.queries).includes(name)) return query(L, node, recv, /** @type {import("./dialect.js").QueryName} */ (name));
  noCallbacks();
  const r = resolveOn(L, recv, name, callee);
  if (!r) return bad(node);
  const label = L.src.slice(callee.range[0], callee.range[1]);
  const d = r.decl;
  switch (d.kind) {
    case "fn": return withSig(L, node, d, `${r.owner}.${name}`, r.recv, args, d.effects, label);
    case "keyed": {
      const keyNode = args[0];
      if (!keyNode) { L.error("L015", node, `${label} needs a ${d.what} name.`, `${label} takes 1 argument at least: a ${d.what} name as a string literal.`); return bad(node); }
      if (keyNode.type !== "Literal" || typeof keyNode.value !== "string") {
        L.error("L011", keyNode, `${label} needs its ${d.what} name written out.`, `Write the ${d.what} name as a string literal, as in ${label}("name").`);
        return bad(node);
      }
      const key = keyNode.value;
      const sig = d.keys[key];
      if (!sig) {
        const keys = Object.keys(d.keys);
        L.error("L011", keyNode, `There is no ${d.what} '${key}'.`, `${didYouMean(key, keys).trim()} ${keys.length ? `Declared: ${keys.join(", ")}.` : `This program declares no ${d.what}.`}`.trim());
        return bad(node);
      }
      const keyExpr = L.ex({ k: "str", v: key, t: { enum: [key] }, span: spanOf(keyNode) });
      const effects = /** @type {Effect[]} */ (d.effects.map((e) => e.replace("{key}", key)));
      return withSig(L, node, { ...sig, effects }, `${r.owner}.${name}`, r.recv, args.slice(1), effects, label, [keyExpr]);
    }
    case "emit": return emitCall(L, node, r, name, args, d.effects, label);
    case "method": return methodCall(L, node, r, d.owner, d.name, args);
    case "value":
      L.error("L003", callee, `'${name}' is not a function.`, `Read it without calling: ${label}.`);
      return bad(node);
  }
  return bad(node);
}

/**
 * Checks arguments against a signature and builds the call.
 * @param {Lowerer} L
 * @param {AST.CallExpression} node
 * @param {FnSig} sig
 * @param {string} fn
 * @param {Expr} recv
 * @param {AST.Expression[]} args
 * @param {Effect[]} effects
 * @param {string} label
 * @param {Expr[]} [lead]  Arguments already lowered (a keyed call's key).
 * @returns {Expr}
 */
function withSig(L, node, sig, fn, recv, args, effects, label, lead = []) {
  const min = sig.minArgs ?? sig.params.length;
  const max = sig.rest ? Infinity : sig.params.length;
  if (args.length < min || args.length > max) {
    const n = lead.length;
    const range = max === Infinity ? `${min + n} or more` : min === max ? `${min + n}` : `${min + n} to ${max + n}`;
    L.error("L015", node, `${label} got ${args.length + n} argument${args.length + n === 1 ? "" : "s"}.`, `${label} takes ${range} argument${range === "1" ? "" : "s"}.`);
    return bad(node);
  }
  /** @type {Map<string, Type>} */
  const bound = new Map();
  const vals = seq(L, [() => recv, ...args.map((a, i) => () => {
    const p = i < sig.params.length ? sig.params[i] : /** @type {Type} */ (sig.rest);
    if (JSON.stringify(p).includes("tvar")) {
      const v = expr(L, a);
      if (!unify(p, v.t, bound)) mismatch(L, a, v.t, substitute(p, bound), `argument ${i + 1} of ${label}`);
      return v;
    }
    return check(L, a, p, `argument ${i + 1 + lead.length} of ${label}`);
  })]);
  const [r, ...rest] = vals;
  return L.ex({ k: "call", fn, recv: r, args: [...lead, ...rest], effects, t: substitute(sig.returns, bound), span: spanOf(node) }, effects);
}

/**
 * `w.emit("name", payload)`: the payload's type is checked against other sites and recorded.
 * @param {Lowerer} L
 * @param {AST.CallExpression} node
 * @param {Resolved} r
 * @param {string} name
 * @param {AST.Expression[]} args
 * @param {Effect[]} effects
 * @param {string} label
 * @returns {Expr}
 */
function emitCall(L, node, r, name, args, effects, label) {
  const [evNode, payloadNode] = args;
  if (!evNode || args.length > 2) { L.error("L015", node, `${label} got ${args.length} arguments.`, `${label} takes 1 or 2 arguments: an event name and a payload.`); return bad(node); }
  if (evNode.type !== "Literal" || typeof evNode.value !== "string") {
    L.error("L011", evNode, `${label} needs its event name written out.`, `Write the event name as a string literal, as in ${label}("hit", { … }).`);
    return bad(node);
  }
  const ev = evNode.value;
  const evExpr = L.ex({ k: "str", v: ev, t: { enum: [ev] }, span: spanOf(evNode) });
  const vals = seq(L, [() => r.recv, ...(payloadNode ? [() => expr(L, payloadNode)] : [])]);
  const payload = vals[1];
  const t = payload ? payload.t : { struct: {} };
  const known = L.sigs.events[ev];
  if (known && !assignable(t, known)) L.error("L014", payloadNode ?? node, `Event '${ev}' is sent here with ${showType(t)}, elsewhere with ${showType(known)}.`, `Send '${ev}' with the same payload fields and types everywhere.`);
  L.emits.push({ name: ev, t });
  const own = /** @type {Effect[]} */ (effects.map((e) => e.replace("{key}", ev)));
  return L.ex({ k: "call", fn: `${r.owner}.${name}`, recv: vals[0], args: payload ? [evExpr, payload] : [evExpr], effects: own, t: "void", span: spanOf(node) }, own);
}

/**
 * `from` and every method it calls, directly or not.
 * @param {import("./dialect.js").Signatures} sigs
 * @param {string} from
 * @returns {string[]}
 */
export function reachable(sigs, from) {
  const seen = new Set([from]);
  const stack = [from];
  while (stack.length) {
    for (const k of sigs.methods[/** @type {string} */ (stack.pop())]?.calls ?? []) {
      if (!seen.has(k)) { seen.add(k); stack.push(k); }
    }
  }
  return [...seen];
}

/**
 * A call to a method the program defines; its signature comes from the program's inference.
 * @param {Lowerer} L
 * @param {AST.CallExpression} node
 * @param {Resolved} r
 * @param {string} owner
 * @param {string} name
 * @param {AST.Expression[]} args
 * @returns {Expr}
 */
function methodCall(L, node, r, owner, name, args) {
  const key = `${owner}.${name}`;
  const sig = L.sigs.methods[key];
  if (sig && args.length !== sig.params.length) {
    L.error("L015", node, `${key} got ${args.length} arguments.`, `${key} takes ${sig.params.length}.`);
    return bad(node);
  }
  // Both are reported without bailing out, so the call is still recorded and the next pass sees the same call graph.
  const self = L.slot.kind === "method" ? `${L.slot.on}.${L.slot.key}` : null;
  if (self && reachable(L.sigs, key).includes(self)) {
    L.error("L007", node, `${self} calls itself${key === self ? "" : ` through ${key}`}, so how long it runs cannot be bounded.`, "Replace the recursion with a counted for loop or a query.");
  }
  if (sig?.partial && (L.decl.forbid.length > 0 || L.pure > 0)) {
    L.error("L014", node, `The effects of ${key} are unknown because it, or a method it calls, does not lower.`, `Fix ${key}'s diagnostics first; a ${L.slot.kind} may call only methods whose effects are known.`);
  }
  const vals = seq(L, [() => r.recv, ...args.map((a, i) => () => (sig ? check(L, a, sig.params[i], `argument ${i + 1} of ${key}`) : expr(L, a)))]);
  const [recv, ...rest] = vals;
  L.calls.push({ key, args: rest.map((v) => v.t) });
  const effects = /** @type {Effect[]} */ ([`call ${key}`, ...(sig?.effects ?? [])]);
  return L.ex({ k: "method", owner, name, recv, args: rest, effects, t: sig?.returns ?? "unknown", span: spanOf(node) }, effects);
}

