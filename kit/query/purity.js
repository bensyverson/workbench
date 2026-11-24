// Purity with helper look-through. It reads each Kernel's recorded effects, which the verifier holds
// to cover its body (V007, V008), so a call of a helper is judged by that helper's own Kernel.

import { reachableHelpers } from "./reads.js";

/** @import { Kernel, Effect } from "../ir/ir.js" */
/** @import { Impure } from "./query.js" */

/**
 * The effects that keep `main` and each helper it reaches from being pure: one entry per Kernel, `main`
 * first, then the helpers in the order first reached, each with its recorded effects less a `call` of any
 * helper in `helpers` (judged by its own entry) and less what `allow` admits. An entry with no effects is a
 * pure Kernel.
 * @param {Kernel} main
 * @param {Kernel[]} helpers  The helpers on offer; a call of any other is an effect like any.
 * @param {(effect: Effect) => boolean} [allow]  Effects the caller accepts, such as reads of its uniforms.
 * @returns {Impure[]}
 */
export function impurities(main, helpers, allow = () => false) {
  const names = new Set(helpers.map((h) => h.name));
  /** @param {Effect} e */
  const helperCall = (e) => e.startsWith("call ") && names.has(e.slice("call ".length));
  return [main, ...reachableHelpers(main, helpers)].map((kernel) => ({ kernel, effects: kernel.effects.filter((e) => !helperCall(e) && !allow(e)) }));
}

/**
 * Whether `main` and every helper it reaches are pure, as `impurities` judges.
 * @param {Kernel} main
 * @param {Kernel[]} helpers
 * @param {(effect: Effect) => boolean} [allow]
 * @returns {boolean}
 */
export function isPure(main, helpers, allow) {
  return impurities(main, helpers, allow).every((i) => i.effects.length === 0);
}
