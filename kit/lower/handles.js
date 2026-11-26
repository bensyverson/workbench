// The handle rule: a handle the language hands a lambda (a slot parameter of object type, or a global of
// object type: particles' `p`, `rng`, `$`, fields' `u`, DMG's `self` and `w`) is used only as `h.member`,
// `h.method(…)`, `h(…)` when its object is callable, or passed whole as an argument of any call (a Program
// helper, a Dialect method such as DMG's `w.overlap(self, b)`, an intrinsic, a keyed call), whose own type check
// still applies; a callable one is only called. A value of object type that is not a handed-in name (`const m = w.spawn(…)`, a query callback's
// item) is not a handle. A helper's own parameter of object type is a handle inside the helper, whatever a call
// site passes it, so the rule holds however far a handle is passed. A sampler (kit/ir) is stricter: a sampler read,
// a uniform's or a helper parameter's, is only passed whole as a call's argument (`refuseSampler`).

import { isSampler } from "../ir/verify-rules.js";

/** @import * as AST from "../parse/ast.js" */
/** @import { Type } from "../ir/ir.js" */
/** @import { Lowerer } from "./lowerer.js" */

/**
 * Where an identifier stands, as far as the rule cares: the object of a member access, a call's callee, an
 * argument of any call, or the target of an assignment (refused by the store rules, L013). Every other identifier
 * has role "other" and its parent node, so one expression that misuses a handle twice (`p === p`) is refused once.
 * @typedef {{ role: "member" | "callee" | "arg" | "target" } | { role: "other", parent: { range?: [number, number] } }} Role
 */

/**
 * Every identifier in an allowed position, by node.
 * @param {unknown} root
 * @returns {Map<object, Role>}
 */
export function handleRoles(root) {
  /** @type {Map<object, Role>} */
  const roles = new Map();
  const walk = (/** @type {unknown} */ node, /** @type {{ range?: [number, number] } | null} */ parent = null) => {
    if (Array.isArray(node)) { for (const n of node) walk(n, parent); return; }
    if (!node || typeof node !== "object") return;
    const n = /** @type {AST.Node & Record<string, any>} */ (node);
    if (n.type === "Identifier" && parent && !roles.has(n)) roles.set(n, { role: "other", parent });
    if (n.type === "MemberExpression" && n.object.type === "Identifier") roles.set(n.object, { role: "member" });
    if (n.type === "CallExpression") {
      if (n.callee.type === "Identifier") roles.set(n.callee, { role: "callee" });
      // A member read passed whole (`sample(u.atlas, p)`) is where a sampler may stand (`refuseSampler`).
      for (const a of n.arguments) if (a.type === "Identifier" || a.type === "MemberExpression") roles.set(a, { role: "arg" });
    }
    if (n.type === "AssignmentExpression" && n.left.type === "Identifier") roles.set(n.left, { role: "target" });
    if (n.type === "UpdateExpression" && n.argument.type === "Identifier") roles.set(n.argument, { role: "target" });
    for (const [k, v] of Object.entries(n)) if (k !== "loc" && k !== "range") walk(v, n);
  };
  walk(root);
  return roles;
}

/**
 * The object type a handle's name has, or null when the name is no handle: a parameter of the lambda, or a
 * global, whose type is an object (an entity or a handle type).
 * @param {Type} t
 * @returns {string | null}
 */
function objectOf(t) {
  return typeof t === "object" && ("obj" in t || "ref" in t) ? ("obj" in t ? t.obj : t.ref) : null;
}

/**
 * The tip for a sampler used other than passed whole: the calls that take one, from the Environment's callable
 * globals (fields' `sample(img, …)`, `imageSize(img)`), and a helper.
 * @param {Lowerer} L
 * @param {string} text  How the source wrote the sampler.
 */
function samplerTip(L, text) {
  const takers = Object.entries(L.environment.globals).flatMap(([name, t]) => {
    const sig = typeof t === "object" && "obj" in t ? L.environment.objects[t.obj]?.call : undefined;
    if (!sig || !sig.params.some(isSampler)) return [];
    return [`${name}(${sig.params.map((p) => (isSampler(p) ? text : "…")).join(", ")})`];
  });
  return `A sampler is only passed whole as an argument of a call: ${[...takers, `f(${text})`].join(", ")}. It cannot be stored, returned, compared, tested, chosen by a ternary or read as an object.`;
}

/**
 * Reports L018 when `node`, a sampler read (`u.atlas`, or a helper's sampler parameter), stands anywhere but as an
 * argument of a call: a sampler is only sampled (kit/ir's rule, which GLSL's opaque types share). Returns whether it
 * was refused.
 * @param {Lowerer} L
 * @param {AST.Node} node
 * @param {Type} t
 */
export function refuseSampler(L, node, t) {
  if (!isSampler(t)) return false;
  const r = L.handleRoles.get(node);
  if (r?.role === "arg") return false;
  if (r?.role === "target") return false; // a store to it is the store rules' own L013
  const text = L.src.slice(node.range[0], node.range[1]);
  L.error("L018", node, `'${text}' is a sampler; it cannot be used as a value here.`, samplerTip(L, text));
  return true;
}

/**
 * Reports L018 when `node`, which names a handle of type `t`, stands where a handle may not. Returns whether it
 * was refused.
 * @param {Lowerer} L
 * @param {AST.Identifier} node
 * @param {Type} t
 * @param {"param" | "global"} kind
 */
export function refuseHandle(L, node, t, kind) {
  if (isSampler(t)) return refuseSampler(L, node, t);
  const owner = objectOf(t);
  if (owner === null) return false;
  const callable = Boolean(L.environment.objects[owner]?.call);
  const r = L.handleRoles.get(node);
  if (r?.role === "target") return false;
  if (r?.role === "member" && !callable) return false;
  if (r?.role === "callee") return false; // calling a handle that is not callable is the call's own L003
  if (r?.role === "arg" && !callable) return false; // the call checks the argument's type against its parameter
  const h = node.name;
  // One expression that misuses a handle twice (`p === p`, `c ? p : p`) is one mistake: refused once, silently after.
  if (r?.role === "other") {
    const key = `${h} ${r.parent.range?.[0]}:${r.parent.range?.[1]}`;
    if (L.handleRefused.has(key)) return true;
    L.handleRefused.add(key);
  }
  const what = kind === "global" ? "a handle of the language" : L.slot.kind === "helper" ? "a handle this helper is passed" : "a handle this lambda is given";
  const tip = callable
    ? `A callable handle is only called: write ${h}(…) where the value is needed; it cannot be stored, passed or returned.`
    : `Use it only as ${h}.member, ${h}.method(…), or pass it whole as an argument of a call, f(${h}); it cannot be stored, returned, compared or put in an array or object.`;
  L.error("L018", node, `'${h}' is ${what}; it cannot be used as a value here.`, tip);
  return true;
}
