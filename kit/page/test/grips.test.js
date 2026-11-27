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
  assert.deepEqual(gs.map((g) => [g.part, g.grip, g.index, g.at, g.to]), [["b", "radius", 0, [50, 50], "arg.b.surface#0:0.radius"], ["b", "radius", 1, [20, 20], "arg.b.surface#9:0.radius"]]);
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

test("ZNpW0f. a drag value carries no float noise: with no step to the 15 digits a double holds, with a step to the step's decimals", () => {
  assert.equal(gripValue({ kind: "length", v0: 0.1, p0: [0, 0], p: [0.2, 0], axis: [1, 0] }), 0.3);
  assert.equal(gripValue({ kind: "length", v0: 0, p0: [0, 0], p: [0.29, 0], axis: [1, 0], step: 0.1 }), 0.3);
  assert.deepEqual(gripValue({ kind: "translate", v0: [0.1, 29], p0: [0, 0], p: [0.2, 0.4000000000000057] }), [0.3, 29.4]);
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
  assert.deepEqual(drag.release(), { to: "arg.b.surface#0:0.radius", value: 40 }, "clamped to the Grammar's max");
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

// the lens bench from a Program text (kit/page/fixtures/lens-program.js): a position is a list whose elements the
// Grammar bounds, 0 to 100
import { compose } from "../../compose/index.js";
import { defineUI, run, siteOf } from "../../define/index.js";
import { createPage } from "../index.js";
import { fakeContext, frames } from "../fixtures/bench.js";
import { lens, HERE as LENS } from "../fixtures/lens-program.js";

const LENS_TEXT = `import { g } from "${LENS}";
export default ($) => g("b")
  .lens({ radius: 10, at: [20, 30] })
  .lens({ radius: 25, at: [60, 70] });
`;
/** The lens bench's page over LENS_TEXT; `build` may stand in for the preview's build. */
async function lensText(build) {
  const fn = (await import(`data:text/javascript;base64,${Buffer.from(LENS_TEXT).toString("base64")}`)).default;
  const ui = defineUI(lens.grammar, {
    stage: { draw: "view", pointer: "pointer" },
    grips: {
      radius: { each: "grips", kind: "length", at: (g) => [g.x, g.y], axis: (g) => [g.dx, g.dy], to: (g) => g.r },
      move: { each: "grips", kind: "translate", at: (g) => [g.x, g.y], to: (g) => g.at },
    },
  });
  const record = run(fn).record;
  const packages = [{ name: "lens", ui }];
  const bp = lens.grammar("b");
  const composed = compose("bench").part(bp).show(bp).build({ runtimes: [lens.runtime], packages });
  composed.parts = composed.parts.map((p) => (p.name === "b" ? { ...p, record } : p));
  const f = frames();
  const own = (_part, values, more = {}) => run(fn, { values, ...(more.args ? { args: more.args } : {}) }).record;
  const pg = createPage({ composed, runtimes: [lens.runtime], packages, context: fakeContext(), requestFrame: f.requestFrame, texts: { b: LENS_TEXT }, run: { build: build ? build(own) : own } });
  pg.start(); f.tick(0); f.tick(16);
  return { pg, f, record };
}

test("40b. a list of numbers takes its element's bounds: siteOf gives them, and a translate drag past them is clamped per component", async () => {
  const { pg, f, record } = await lensText();
  const site = siteOf(record, "arg.b.lens#1:0.at");
  assert.deepEqual([site.min, site.max], [0, 100]);
  assert.deepEqual([siteOf(record, "arg.b.lens#1:0.at[0]").min, siteOf(record, "arg.b.lens#1:0.at[0]").max], [0, 100], "an element itself");
  assert.deepEqual([siteOf(record, "arg.b.lens#1:0.radius").min, siteOf(record, "arg.b.lens#1:0.radius").max], [1, 40], "a number is as it was");
  const d = pg.grab({ part: "b", grip: "move", index: 0 }, [20, 30]);
  d.move([180, -40]);
  f.tick(32);
  assert.equal(pg.status().halted, null);
  assert.deepEqual(d.release(), { to: "arg.b.lens#0:0.at", value: [100, 0] });
  assert.deepEqual(pg.run.log.inputs.filter((e) => e.kind === "rebuild").at(-1).record.lens[0].at, [100, 0]);
});

test("40c. a preview whose build fails is skipped with a page diagnostic: the frame loop goes on, and the release gives the last value that built", async () => {
  // a build that refuses a radius past 30, as a Dialect's own check would
  const { pg, f } = await lensText((own) => (part, values, more = {}) => (Object.values(more.args ?? {}).some((v) => v > 30) ? null : own(part, values, more)));
  const d = pg.grab({ part: "b", grip: "radius", index: 0 }, [20, 30]);
  d.move([30, 30]);
  f.tick(32);
  d.move([45, 30]);
  f.tick(48);
  assert.equal(pg.status().halted, null, "the frame loop did not stop");
  const said = pg.diagnostics.find((x) => x.code === "H012");
  assert.ok(said, JSON.stringify(pg.diagnostics));
  assert.match(said.message, /preview/);
  assert.deepEqual(pg.run.log.inputs.filter((e) => e.kind === "rebuild").map((e) => e.record.lens[0].radius), [20], "the failed preview is not logged");
  f.tick(64);
  assert.ok(pg.run.seconds > 0.04, "frames still run");
  assert.deepEqual(d.release(), { to: "arg.b.lens#0:0.radius", value: 20 });
  // a build that throws is skipped the same way
  const t = await lensText((own) => (part, values, more = {}) => { if (Object.values(more.args ?? {}).some((v) => v > 30)) throw new Error("B004 radius"); return own(part, values, more); });
  const d2 = t.pg.grab({ part: "b", grip: "radius", index: 0 }, [20, 30]);
  d2.move([45, 30]);
  t.f.tick(32);
  assert.equal(t.pg.status().halted, null);
  assert.ok(t.pg.diagnostics.some((x) => x.code === "H012" && /B004 radius/.test(x.message)));
  assert.deepEqual(d2.release(), { to: "arg.b.lens#0:0.radius", value: 10 }, "nothing built: the value at the down");
});

test("a stepped Grip at its max stays at the max when the max is no multiple of the step (reviewer-80)", () => {
  assert.equal(gripValue({ kind: "length", v0: 1.9, p0: [0, 0], p: [10, 0], axis: [1, 0], step: 0.7, min: 0, max: 2 }), 2);
});

// issue 7HuCx4 N2 (reviewer-82): a page input stamped at its device time can stand ahead of the run's T, and a drag's
// preview logged after it must not then sort after the release, which is in force at once
test("7HuCx4. a release is the last word on its target: no preview of the drag sorts after it, though a device time stands ahead", () => {
  const { page: pg, f } = lensPage();
  pg.unlock();
  pg.start();
  f.tick(0); f.tick(16);
  const at = pg.run.seconds;
  pg.pointer({ type: "pointerdown", x: 90, y: 90, pointerId: 2, buttons: 1, detail: 1, shiftKey: false, altKey: false, metaKey: false, ctrlKey: false, deltaX: 0, deltaY: 0, timeStamp: 30 });
  const [down] = pg.run.log.inputs.filter((e) => e.kind === "pointer");
  const sec = (t) => { const [n, d = "1"] = String(t).split("/"); return Number(n) / Number(d); };
  assert.ok(sec(down.T) > at + 0.005, `the pointer's device time stands ahead of T: ${down.T} for ${at}`);
  const drag = pg.grab({ part: "b", grip: "radius", index: 0 }, [50, 50]);
  drag.move([55, 50]);
  f.tick(18); // the frame flushes the preview (15)
  drag.move([58, 50]);
  assert.deepEqual(drag.release(), { to: "arg.b.surface#0:0.radius", value: 18 });
  const radius = () => pg.run.composed.parts.find((p) => p.name === "b").record.surface[0].radius;
  assert.equal(radius(), 18, "the release is in force at once");
  for (const ms of [32, 48, 64, 80]) f.tick(ms);
  assert.equal(radius(), 18, "and stays the last word: the preview logged before it does not land after it");
  const rebuilds = pg.run.log.inputs.filter((e) => e.kind === "rebuild");
  assert.deepEqual(rebuilds.map((e) => e.record.surface[0].radius), [15, 18], "the preview, then the release, in log order");
});
