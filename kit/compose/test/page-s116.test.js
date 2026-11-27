// S116's wording on page wires: the fold at a max above 1, and a glue policy that gives up the held-state guarantee.
// Rewritten for declared Controls (2026-11-27): the page's Control is the part's own `steer` buttons, declared in its
// UI, where PAGE_CONTROLS once gave a pad; the fold's sentence now says "folds" (requirement 3's wording, which names
// the state class), so the first test's expected text changed with it.

import { test } from "node:test";
import assert from "node:assert/strict";
import { compose, page } from "../index.js";
import { defineUI, list } from "../../define/index.js";
import { tiny } from "../../run/test/helpers.js";

const W = tiny("walk", { state: { x: "f64", seen: list("f64", 10) }, inputs: false, ports: { in: { steer: { seam: "Event<{ right: bool }>", note: "the steering" } } } },
  { clock: () => ({ tick: 1 / 4 }), init: () => ({ x: 0, seen: [] }), events: { in: { steer: 3 } }, step: (/** @type {any} */ s) => s });
const ui = defineUI(W.grammar, { controls: { steer: { kind: "buttons", buttons: ["right"] } } });
/** @param {any} [options] */
const s116 = (options) => {
  const h = /** @type {any} */ (W.grammar("hero"));
  return compose("walk").part(h).wire(/** @type {any} */ (page.out).steer, h.in.steer, options).check({ runtimes: [W.runtime], packages: [{ name: "walk", ui }] }).filter((d) => d.code === "S116");
};

test("S116 on a page wire with max 3 says a step takes the first 2 in order, then the latest", () => {
  const [d] = s116();
  assert.equal(d.severity, "warning");
  assert.match(d.message, /folds: a step takes the first 2 in order, then the latest/);
});

test("S116 on a page wire with a glue policy says the policy gives up the held-state guarantee", () => {
  const [d] = s116({ overflow: "keepFirst" });
  assert.equal(d.severity, "warning");
  assert.match(d.message, /replaces the page wire's fold, so the latest held state may not arrive/);
});
