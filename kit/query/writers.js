// Who writes a place: the stores to it, and the calls whose recorded effects say they write it.

import { walk } from "./walk.js";

/** @import { Kernel, Effect } from "../ir/ir.js" */
/** @import { WriteSite, WriteVia } from "./query.js" */

/**
 * Every site in `kernels` that writes `place`, Kernel by Kernel in evaluation order: a `store` to it, or a
 * call, method or helper call whose effects include `write <place>`. A method's or helper's effects include
 * its callee's, so a call that writes through its callee is a site too; the store inside the callee is
 * another, when the callee's Kernel is among `kernels`.
 * @param {Kernel[]} kernels
 * @param {string} place  As an effect names it: `Mole.ttl`, `World.pos`, `bg.scroll`.
 * @returns {WriteSite[]}
 */
export function writers(kernels, place) {
  const effect = /** @type {Effect} */ (`write ${place}`);
  /** @type {WriteSite[]} */
  const out = [];
  for (const k of kernels) {
    walk(k, (n) => {
      /** @type {WriteVia | null} */
      let via = null;
      if (n.k === "store" && `${n.place.owner}.${n.place.name}` === place) via = "store";
      else if ((n.k === "call" || n.k === "method" || n.k === "helper") && n.effects.includes(effect)) via = n.k;
      if (via) out.push({ place, via, kernel: k.name, span: n.span, node: n });
    });
  }
  return out;
}
