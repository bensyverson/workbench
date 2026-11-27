// The page follows the box in force (leaf EggIAM): when a rebuild changes the shown picture's extent, the page's
// size, its clear and its translation follow the new box, as kit/run's pageView does, so a grown picture is drawn on
// the canvas rather than off it.

import { test } from "node:test";
import assert from "node:assert/strict";
import { defineRuntime } from "../../define/index.js";
import { compose } from "../../compose/index.js";
import { createPage } from "../index.js";
import { fakeContext, frames } from "../fixtures/bench.js";
import { screen } from "../../draw/fixtures/draw-dialects.js";

const tick = { clock: () => ({ tick: 1 / 8 }), init: () => ({ t: 0 }), step: (/** @type {any} */ s, /** @type {any} */ ctx) => ({ t: s.t + ctx.dt }) };

/** A page showing a sequencer-like grid screen whose extent is its record's size; `extent` overrides the frame's. @param {(r: any) => { min: number[], max: number[] }} [extent] */
async function mount(extent) {
  const g = screen((d) => { d.name = "grid"; if (extent) d.frames.px.extent = extent; });
  const runtime = defineRuntime(g, tick);
  const a = /** @type {any} */ (g("a")).size({ width: 40, height: 32 });
  const composed = compose("x").part(a).show(a).build({ runtimes: [runtime] });
  const context = fakeContext(), f = frames();
  const p = createPage({ composed, runtimes: [runtime], packages: [], context, requestFrame: f.requestFrame });
  await p.ready;
  const grown = /** @type {any} */ (g("a")).size({ width: 80, height: 16 }).build();
  return { p, f, context, grown };
}

test("a rebuild that grows the shown picture grows the page's size and clears the whole new box", async () => {
  const { p, f, context, grown } = await mount();
  assert.deepEqual(p.size, { width: 40, height: 32 });
  p.run.input({ kind: "rebuild", T: 0.25, part: "a", record: grown });
  p.start();
  for (let ms = 1000; ms <= 1600; ms += 16) f.tick(ms);
  assert.equal(p.run.builds.at(-1)?.ok, true);
  assert.deepEqual(p.size, { width: 80, height: 16 });
  const clears = /** @type {any[][]} */ (context.calls).filter((c) => c[0] === "clearRect");
  assert.ok(clears.some((c) => c[3] === 80 && c[4] === 32), "the frame that meets the new box clears over the old one too");
  assert.deepEqual(clears.at(-1), ["clearRect", 0, 0, 80, 16]);
});

test("a rebuild that moves the box's min translates by the new min", async () => {
  const { p, f, context, grown } = await mount((r) => ({ min: [40 - r.size.width, 0], max: [40, r.size.height] }));
  p.run.input({ kind: "rebuild", T: 0.25, part: "a", record: grown });
  p.start();
  for (let ms = 1000; ms <= 1600; ms += 16) f.tick(ms);
  const moves = /** @type {any[][]} */ (context.calls).filter((c) => c[0] === "translate");
  assert.ok(moves.some((c) => c[1] === 40 && c[2] === 0), JSON.stringify(moves.slice(-4)));
});
