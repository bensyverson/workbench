// The call-site join: a method or helper has one type per parameter, the strict join of
// what every call site passes. A call site that cannot join is recorded as a conflict
// and reported where it is, once, naming the earlier site it disagrees with.

import { strictJoin, sameType, showType } from "../ir/types.js";
import { HELPER_OWNER } from "./codes.js";
import { describe } from "./expr.js";

/** @import { Type } from "../ir/ir.js" */
/** @import { CallSite, ArgSite, SiteConflict } from "./environment.js" */

/**
 * @param {CallSite[]} calls  Every call to one method, in program order.
 * @param {string} key  The method's key, `Owner.name`.
 * @param {number} arity  The parameters the method declares; a call with another count joins nothing (it is L015 where it is).
 * @returns {{ params: Type[], conflicts: SiteConflict[] }}
 */
export function joinCallSites(calls, key, arity) {
  /** @type {Type[]} */
  const params = [];
  /** @type {Array<Array<{ t: Type, site: ArgSite }>>} */
  const seen = [];
  /** @type {SiteConflict[]} */
  const conflicts = [];
  const name = key.startsWith(`${HELPER_OWNER}.`) ? key.slice(HELPER_OWNER.length + 1) : key;
  const matching = calls.filter((c) => c.args.length === arity);
  // With no call to join, `params` stays empty: nothing says what the parameters are.
  if (matching.length === 0) return { params, conflicts };
  for (let i = 0; i < arity; i++) { params[i] = "unknown"; seen[i] = []; }
  for (const c of matching) {
    c.args.forEach((t, i) => {
      const joined = strictJoin(params[i], t);
      if (joined !== null) {
        params[i] = joined;
        seen[i].push({ t, site: c.sites[i] });
        return;
      }
      const earlier = seen[i].find((e) => strictJoin(e.t, t) === null) ?? seen[i][0];
      const where = (/** @type {ArgSite} */ s) => `${siteName(s)} line ${s.line}`;
      const nested = literalDifference(earlier.t, t);
      conflicts.push({
        ...c.sites[i], param: i,
        message: `\`${name}\` takes ${describe(earlier.t)} at ${where(earlier.site)} and ${describe(t)} at ${where(c.sites[i])}; one parameter has one type.${nested ? ` They differ in ${nested.where}: ${nested.a} vs ${nested.b}.` : ""}`,
        tip: nested
          ? `Pass the differing value as its own parameter of ${name}: two string literals there give an enum of both. A string nested in a list or struct must be the same everywhere.`
          : `Pass ${name} the same type at every call, or split it into two functions.`,
      });
    });
  }
  return { params, conflicts };
}

/**
 * A call site's lambda, naming its owner when the slot id does not (a lambda shared by several kinds has one id).
 * @param {ArgSite} s
 */
export function siteName(s) {
  return s.slot.startsWith(`${s.on}.`) ? s.slot : `${s.slot} on ${s.on}`;
}

/**
 * Where two structs or lists differ only in string literals nested inside them, or null
 * when they differ in anything else.
 * @param {Type} a
 * @param {Type} b
 * @returns {{ where: string, a: string, b: string } | null}
 */
function literalDifference(a, b) {
  const d = diff(a, b);
  if (!d) return null;
  /** @type {string[]} */
  const parts = [];
  /** @type {string[]} */
  let fields = [];
  const flush = () => { if (fields.length) parts.push(`field \`${fields.join(".")}\``); fields = []; };
  for (const seg of d.path) {
    if (seg === null) { flush(); parts.push("the items"); } else fields.push(seg);
  }
  flush();
  return { where: parts.join(", "), a: showType(d.a), b: showType(d.b) };
}

/**
 * @param {Type} a
 * @param {Type} b
 * @returns {{ path: Array<string | null>, a: Type, b: Type } | null}  `null` in a path is a list's items.
 */
function diff(a, b) {
  if (typeof a !== "object" || typeof b !== "object" || sameType(a, b)) return null;
  const literal = (/** @type {object} */ t) => "enum" in t && !("declared" in t);
  if (literal(a) && literal(b)) return { path: [], a, b };
  if ("struct" in a && "struct" in b) {
    const keys = Object.keys(a.struct);
    if (keys.length !== Object.keys(b.struct).length || !keys.every((k) => k in b.struct)) return null;
    /** @type {ReturnType<typeof diff>} */
    let first = null;
    for (const k of keys) {
      if (sameType(a.struct[k], b.struct[k])) continue;
      const d = diff(a.struct[k], b.struct[k]);
      if (!d) return null;
      first ??= { ...d, path: [k, ...d.path] };
    }
    return first;
  }
  if ("list" in a && "list" in b && a.max === b.max && a.len === b.len) {
    const d = diff(a.list, b.list);
    return d && { ...d, path: [null, ...d.path] };
  }
  return null;
}
