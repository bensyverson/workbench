// @ts-nocheck: page and run objects are generated, which TypeScript cannot follow here.
// Grips (project/2026-11-27-controls-draft.md, requirements 7 and 8; build plan group 40): the page lists each item's
// Grip at its stage position, a disabled one with its H011; a drag's value follows its kind, clamped and rounded by the
// target's own bounds; a preview logs at most one input a frame, and the release gives the commit. The lens bench.
import { test } from "node:test";
import assert from "node:assert/strict";
import { gripValue } from "../index.js";
import { lensPage } from "../fixtures/controls-bench.js";

test("40a. page.grips() lists each item's Grip at its stage position, and a disabled one with its H011", () => {
  const { page: pg } = lensPage();
  pg.run.runUntil(0.1);
  const gs = pg.grips();
  assert.deepEqual(gs.map((g) => [g.part, g.grip, g.index, g.at, g.to]), [["b", "radius", 0, [50, 50], "arg.b.surface#1:0.radius"], ["b", "radius", 1, [20, 20], "arg.b.surface#9:0.radius"]]);
  assert.equal(gs[0].disabled, null);
  assert.equal(gs[1].disabled.code, "H011");
  assert.match(gs[1].disabled.message, /no call/);
  assert.ok(pg.diagnostics.some((d) => d.code === "H011"), "the page lists it");
});

test("40b. the drag value for translate, length, rotate and scale, clamped to the bounds and rounded when whole or stepped", () => {
  assert.deepEqual(gripValue({ kind: "translate", v0: [1, 2], p0: [0, 0], p: [3, 4] }), [4, 6]);
  assert.equal(gripValue({ kind: "length", v0: 10, p0: [0, 0], p: [3, 4], axis: [2, 0] }), 11.5);
  assert.ok(Math.abs(gripValue({ kind: "rotate", v0: 0, p0: [1, 0], p: [0, 1], center: [0, 0], unit: "deg" }) - 90) < 1e-9);
  assert.ok(Math.abs(gripValue({ kind: "rotate", v0: 0, p0: [1, 0], p: [0, -1], center: [0, 0], unit: "rad" }) + Math.PI / 2) < 1e-9);
  assert.equal(gripValue({ kind: "scale", v0: 2, p0: [1, 0], p: [3, 0], center: [0, 0] }), 6);
  assert.equal(gripValue({ kind: "length", v0: 10, p0: [0, 0], p: [100, 0], axis: [1, 0], max: 40 }), 40, "clamped");
  assert.equal(gripValue({ kind: "length", v0: 10, p0: [0, 0], p: [-100, 0], axis: [1, 0], min: 0 }), 0);
  assert.equal(gripValue({ kind: "length", v0: 1, p0: [0, 0], p: [1.6, 0], axis: [1, 0], whole: true }), 3, "rounded when whole");
  assert.equal(gripValue({ kind: "length", v0: 0, p0: [0, 0], p: [0.37, 0], axis: [1, 0], step: 0.25 }), 0.25);
  assert.equal(gripValue({ kind: "length", v0: 0, p0: [0, 0], p: [0.37, 0], axis: [1, 0], step: 0.25, alt: true }), 0.37, "Alt suspends the step");
});

test("40c. an arg Grip logs at most one rebuild a frame, built with args; a param Grip one param input; the release gives the commit", () => {
  const { page: pg, f } = lensPage();
  pg.unlock();
  pg.start();
  f.tick(0); f.tick(16);
  const drag = pg.grab({ part: "b", grip: "radius", index: 0 }, [50, 50]);
  drag.move([52, 50]); drag.move([54, 50]); drag.move([55, 50]);
  f.tick(32);
  const rebuilds = pg.run.log.inputs.filter((e) => e.kind === "rebuild");
  assert.equal(rebuilds.length, 1, "one rebuild for the frame");
  assert.equal(rebuilds[0].record.surface[0].radius, 15);
  drag.move([200, 50]);
  f.tick(48);
  assert.deepEqual(drag.release(), { to: "arg.b.surface#1:0.radius", value: 40 }, "clamped to the Grammar's max");
  assert.throws(() => pg.grab({ part: "b", grip: "radius", index: 1 }, [20, 20]), /H011/, "a disabled Grip cannot be grabbed");

  const param = lensPage({ grips: { focus: { kind: "length", at: () => [10, 10], axis: () => [1, 0], to: () => "param.focus" } } });
  param.page.unlock();
  param.page.start();
  param.f.tick(0); param.f.tick(16);
  const d = param.page.grab({ part: "b", grip: "focus", index: 0 }, [10, 10]);
  d.move([11, 10]); d.move([12, 10]);
  param.f.tick(32);
  const params = param.page.run.log.inputs.filter((e) => e.kind === "param");
  assert.deepEqual(params.map((e) => [e.name, e.value]), [["focus", 7]]);
  assert.deepEqual(d.release(), { to: "param.focus", value: 7 });
});
