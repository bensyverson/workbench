// The recording builder generated from a grammar: no lowering, no checks of arguments, only the calls in
// order, so the checker can find the lambdas and the Program's own units. A child construct is opened by
// its name on its parent's builder and has every method of its ancestors (calling one ends the child);
// `rejected` names are accepted; any other method is C004 with a did-you-mean, and the chain carries on.

import { session, callSite } from "./session.js";
import { constructsOf, ancestors, ownMethods } from "./grammar.js";
import { didYouMean } from "./common.js";
import { isPlainObject } from "./tags.js";

/** @import { Recording } from "./session.js" */

/** Marks a builder, so the checker can tell an exported chain from anything else. */
export const BUILDER = Symbol("recording builder");
/** Marks what `.build()` returns, so the checker can say "export the chain without .build()". */
export const BUILT = Symbol("built record");
/** The kit's own builder methods, on every construct. */
export const KIT_METHODS = Object.freeze(["build", "check"]);

/**
 * The root builder function of a grammar definition.
 * @param {unknown} def
 * @returns {(...args: unknown[]) => unknown}
 */
export function rootBuilder(def) {
  const cs = constructsOf(def);
  const root = isPlainObject(def) && typeof def.root === "string" && cs[def.root] ? def.root : null;

  /** @param {string} c */
  const rejected = (c) => (isPlainObject(cs[c]?.rejected) ? Object.keys(/** @type {object} */ (cs[c].rejected)) : []);
  /** @param {string} c */
  const slots = (c) => (isPlainObject(cs[c]?.slots) ? Object.keys(/** @type {object} */ (cs[c].slots)) : []);

  /**
   * @param {Recording} rec
   * @param {string} construct
   * @returns {unknown}
   */
  const builder = (rec, construct) => new Proxy({}, {
    get(_, prop) {
      if (prop === BUILDER) return { recording: rec, construct };
      if (typeof prop === "symbol" || prop === "then") return undefined;
      return (/** @type {unknown[]} */ ...args) => {
        const line = callSite().line;
        if (KIT_METHODS.includes(prop)) {
          rec.calls.push({ construct, method: prop, what: "kit", args, line });
          return prop === "build" ? { [BUILT]: true } : [];
        }
        for (const owner of [construct, ...ancestors(cs, construct)]) {
          if (slots(owner).includes(prop)) {
            rec.calls.push({ construct: owner, method: prop, what: "slot", args, line });
            return builder(rec, owner);
          }
          const child = Object.entries(cs).find(([n, c]) => n === prop && c.parent === owner);
          if (child) {
            rec.calls.push({ construct: prop, method: prop, what: "open", args, line });
            return builder(rec, prop);
          }
          if (rejected(owner).includes(prop)) {
            rec.calls.push({ construct: owner, method: prop, what: "rejected", args, line });
            return builder(rec, owner);
          }
        }
        rec.calls.push({ construct, method: prop, what: "unknown", args, line });
        if (!root) return builder(rec, construct); // the grammar has no usable root; D010 already says so
        const known = [...new Set([construct, ...ancestors(cs, construct)].flatMap((c) => [...ownMethods(cs, c), ...rejected(c)]).concat(KIT_METHODS))];
        const hint = didYouMean(prop, known);
        session.add({
          file: rec.file, line, code: "C004", severity: "error",
          message: `${construct} has no method '${prop}'.${hint}`,
          fix: hint ? `call ${hint.replace(/^ Did you mean '(.*)'\?$/, ".$1(…)")} instead` : `use one of ${known.map((m) => `.${m}`).join(", ")}, or add '${prop}' to the grammar (as a slot, or under rejected with a reason)`,
        });
        return builder(rec, construct);
      };
    },
  });

  return (...args) => {
    const site = callSite();
    /** @type {Recording} */
    const rec = { file: site.file, line: site.line, calls: [] };
    session.recordings.push(rec);
    if (root) rec.calls.push({ construct: root, method: root, what: "open", args, line: site.line });
    return builder(rec, root ?? "(no root)");
  };
}
