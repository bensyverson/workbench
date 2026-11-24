// The call-site join: a method or helper has one type per parameter, the strict join of
// what every call site passes. A call site that cannot join is recorded as a conflict
// and reported where it is, once, naming the earlier site it disagrees with.

import { strictJoin } from "../ir/types.js";
import { HELPER_OWNER } from "./codes.js";
import { describe } from "./expr.js";

/** @import { Type } from "../ir/ir.js" */
/** @import { CallSite, ArgSite, SiteConflict } from "./environment.js" */

/**
 * @param {CallSite[]} calls  Every call to one method, in program order.
 * @param {string} key  The method's key, `Owner.name`.
 * @returns {{ params: Type[], conflicts: SiteConflict[] }}
 */
export function joinCallSites(calls, key) {
  /** @type {Type[]} */
  const params = [];
  /** @type {Array<Array<{ t: Type, site: ArgSite }>>} */
  const seen = [];
  /** @type {SiteConflict[]} */
  const conflicts = [];
  const name = key.startsWith(`${HELPER_OWNER}.`) ? key.slice(HELPER_OWNER.length + 1) : key;
  const first = calls[0];
  if (!first) return { params, conflicts };
  first.args.forEach((_, i) => { params[i] = "unknown"; seen[i] = []; });
  for (const c of calls) {
    // A call with another number of arguments is reported as such where it is, and joins nothing.
    if (c.args.length !== first.args.length) continue;
    c.args.forEach((t, i) => {
      const joined = strictJoin(params[i], t);
      if (joined !== null) {
        params[i] = joined;
        seen[i].push({ t, site: c.sites[i] });
        return;
      }
      const earlier = seen[i].find((e) => strictJoin(e.t, t) === null) ?? seen[i][0];
      const where = (/** @type {ArgSite} */ s) => `${s.slot} line ${s.line}`;
      conflicts.push({
        ...c.sites[i], param: i,
        message: `\`${name}\` takes ${describe(earlier.t)} at ${where(earlier.site)} and ${describe(t)} at ${where(c.sites[i])}; one parameter has one type.`,
        tip: `Pass ${name} the same type at every call, or split it into two functions.`,
      });
    });
  }
  return { params, conflicts };
}
