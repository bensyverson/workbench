// A hand-edited layer `max` that contradicts its inputs is refused at createRun (N007): the max is the sum of the
// producers' built maxes (a layer input counts as that layer's max), which is what kit/compose writes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defineRuntime } from "../../define/index.js";
import { compose, layer } from "../../compose/index.js";
import { createRun } from "../index.js";
import { screen } from "../../draw/fixtures/draw-dialects.js";

const tick = { clock: () => ({ tick: 1 / 8 }), init: () => ({ t: 0 }), step: (/** @type {any} */ s, /** @type {any} */ ctx) => ({ t: s.t + ctx.dt }) };

function bench() {
  const lg = screen((d) => { d.name = "lens"; });
  const gg = screen((d) => { d.name = "gridd"; });
  const runtimes = [lg, gg].map((g) => defineRuntime(g, tick));
  const lens = /** @type {any} */ (lg("lens")).size({ width: 40, height: 32 });
  const grid = /** @type {any} */ (gg("grid")).size({ width: 40, height: 32 });
  const grid2 = /** @type {any} */ (gg("grid2")).size({ width: 40, height: 32 });
  const c = compose("lens-bench").part(lens).part(grid).part(grid2)
    .frame(grid.frame.px, lens.frame.px, { scale: 2, offset: 1 })
    .frame(grid2.frame.px, lens.frame.px, { scale: 2, offset: 1 });
  const top = layer("top", lens.out.view, grid.out.view);
  const composed = c.show(layer("outer", top.out.view, grid2.out.view)).build({ runtimes });
  return { composed, runtimes };
}

/** @returns {string | null} the N007 messages, or null when accepted */
const verdict = (/** @type {any} */ record, /** @type {any[]} */ runtimes) => {
  try { createRun(record, { runtimes }); return null; } catch (e) { return /** @type {any} */ (e).diagnostics?.map((/** @type {any} */ d) => `${d.code} ${d.message}`).join("\n") ?? String(e); }
};
const editLayer = (/** @type {any} */ composed, /** @type {string} */ name, /** @type {(l: any) => any} */ f) => ({ ...composed, parts: composed.parts.map((/** @type {any} */ p) => (p.name === name ? { ...p, layer: f(p.layer) } : p)) });

test("a layer max that is the sum of its inputs' (a nested layer counting its own) runs", () => {
  const { composed, runtimes } = bench();
  const max = (/** @type {string} */ n) => composed.parts.find((/** @type {any} */ p) => p.name === n)?.layer?.max;
  assert.equal(max("top"), 130);
  assert.equal(max("outer"), 195);
  assert.equal(verdict(composed, runtimes), null);
});

test("a max that disagrees with the inputs' is N007, on an inner or an outer layer", () => {
  const { composed, runtimes } = bench();
  for (const [name, max] of /** @type {Array<[string, number]>} */ ([["top", 0], ["top", 5], ["top", 131], ["outer", 130], ["outer", 196]])) {
    assert.match(String(verdict(editLayer(composed, name, (l) => ({ ...l, max })), runtimes)), /N007 layer '[a-z]+': its record's max is \d+, but its inputs' maxes sum to \d+/, `${name} max ${max}`);
  }
});
