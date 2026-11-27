// The lens bench (a non-founding workbench: the controls draft's Grips with write-back) as one module, so a Program or
// glue text that a write-back test builds by a `data:` URL imports the same Grammar and runtime by this module's URL.
// Each lens has a radius and a position, both bounded in the Grammar; the runtime lists one Grip item per lens, whose
// targets it builds from the record (a Ref id's #n counts the root's calls across its slots, the params first).
// Beside test/, since every file under a test/ folder runs as a test.

import { list, struct, data, listOf, pointerSeam } from "../../define/index.js";
import { tiny } from "../../run/test/helpers.js";

/** The lens bench's Grammar and runtime. */
export const lens = tiny("lens", {
  state: { grips: list(struct({ x: "f64", y: "f64", dx: "f64", dy: "f64", r: "str", at: "str" }), 8), seen: "f64" }, inputs: false,
  frames: { px: { dims: 2, note: "pixels", extent: () => ({ min: [0, 0], max: [100, 100] }) } },
  ports: {
    in: { pointer: { seam: pointerSeam("px") } },
    out: { view: { seam: "Draw<16>@px", from: () => [{ op: "rect", at: [0, 0], size: [100, 100], fill: "#000000", id: "bg" }] } },
  },
  slots: {
    lens: { kind: "decl", args: [data({ radius: data("number", { min: 1, max: 40 }), at: data(listOf(data("number", { min: 0, max: 100 }))) })] },
  },
}, {
  clock: () => ({ tick: 1 / 60 }), events: { in: { pointer: 16 } },
  init: (/** @type {any} */ r) => {
    const before = Object.keys(r.params ?? {}).length;
    return { seen: 0, grips: (r.lens ?? []).map((/** @type {any} */ l, /** @type {number} */ i) => ({ x: l.at[0], y: l.at[1], dx: 1, dy: 0, r: `arg.${r.name}.lens#${before + i}:0.radius`, at: `arg.${r.name}.lens#${before + i}:0.at` })) };
  },
  step: (/** @type {any} */ s, /** @type {any} */ c) => ({ ...s, seen: s.seen + c.inputs.pointer.length }),
});

/** The lens bench's Grammar. */
export const g = lens.grammar;

/** This module's URL, for a Program text's first line. */
export const HERE = import.meta.url;
