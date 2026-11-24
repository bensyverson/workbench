// What a region reads: the places it loads and the calls it makes, looking through the helpers it
// reaches. A load of a read-only place (a fields uniform, a baked size) is in no effect list, so this
// walks the loads themselves rather than reading `read …` effects.

import { walk, isKernel } from "./walk.js";

/** @import { Kernel } from "../ir/ir.js" */
/** @import { Region, Reads, ReadsOptions } from "./query.js" */

/**
 * What `region` reads: every load and every call, in evaluation order, and the helpers it reaches. A helper
 * call whose helper is among `options.helpers` is followed into that helper's body (once, when first
 * reached, before the call's arguments); its loads and calls name the helper as their `kernel`. A method is
 * a call and is not looked through.
 * @param {Region} region
 * @param {ReadsOptions} [options]
 * @returns {Reads}
 */
export function reads(region, options = {}) {
  const byName = new Map((options.helpers ?? []).map((h) => [h.name, h]));
  /** @type {Reads} */
  const out = { loads: [], calls: [], helpers: [] };
  /** @type {Set<Kernel>} */
  const seen = new Set();
  /** @param {Region} r @param {string} kernel */
  const read = (r, kernel) => walk(r, (n) => {
    if (n.k === "load") {
      const { owner, name } = n.place;
      out.loads.push({ place: `${owner}.${name}`, owner, name, state: n.place.store !== undefined, kernel, span: n.span });
    } else if (n.k === "call" || n.k === "method" || n.k === "helper") {
      const fn = n.k === "method" ? `${n.owner}.${n.name}` : n.k === "call" ? n.fn : n.name;
      out.calls.push({ k: n.k, fn, effects: n.effects, kernel, span: n.span });
      const h = n.k === "helper" ? byName.get(n.name) : undefined;
      if (h && !seen.has(h)) {
        seen.add(h);
        out.helpers.push(h);
        read(h, h.name);
      }
    }
  });
  read(region, isKernel(region) ? region.name : options.kernel ?? "");
  return out;
}

/**
 * The helper Kernels `region` reaches, directly or through other helpers, in the order first reached.
 * @param {Region} region
 * @param {Kernel[]} helpers  The helpers on offer; a call of any other is not followed.
 * @returns {Kernel[]}
 */
export function reachableHelpers(region, helpers) {
  return reads(region, { helpers }).helpers;
}
