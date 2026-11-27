// S116's wording on page wires: the fold at a max above 1, and a glue policy that gives up the held-state guarantee.

import { test } from "node:test";
import assert from "node:assert/strict";
import { compose, page } from "../index.js";
import { list } from "../../define/index.js";
import { tiny } from "../../run/test/helpers.js";

const W = tiny("walk", { state: { x: "f64", seen: list("f64", 10) }, inputs: false, ports: { in: { pad: { seam: "Event<{ right: bool }>", note: "the pad" } } } },
  { clock: () => ({ tick: 1 / 4 }), init: () => ({ x: 0, seen: [] }), events: { in: { pad: 3 } }, step: (/** @type {any} */ s) => s });
/** @param {any} [options] */
const s116 = (options) => {
  const h = W.grammar("hero");
  return compose("walk").part(h).wire(page.out.pad, h.in.pad, options).check({ runtimes: [W.runtime] }).filter((d) => d.code === "S116");
};

test("S116 on a page wire with max 3 says it keeps the first 2 in order and folds the rest", () => {
  const [d] = s116();
  assert.equal(d.severity, "warning");
  assert.match(d.message, /keeps the first 2 in order at each step and folds the rest into the latest/);
});

test("S116 on a page wire with a glue policy says the policy gives up the held-state guarantee", () => {
  const [d] = s116({ overflow: "keepFirst" });
  assert.equal(d.severity, "warning");
  assert.match(d.message, /replaces the page wire's fold, so the latest held state may not arrive/);
});
