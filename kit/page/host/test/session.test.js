// A session on the draw trial's compose leg and the particles preset: frames, pause, step, scrub, param edits, UI
// buttons, keys, and the snapshot the panels read. A fake 2D context and a hand-ticked frame source.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { readPackageDir } from "../../../../scripts/pkg/dir.js";
import { fakeContext, frames } from "../../fixtures/bench.js";
import { loadWorkbench, loadPreset } from "../load.js";
import { createSession } from "../session.js";

const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const DRAW = "scripts/draw-trial/massaged/2026-11-26-compose";
const kit = (/** @type {string} */ p) => new URL(`../../../${p}`, import.meta.url).href;
/** @type {import("../load.js").LoadEnv} */
const env = {
  urls: { define: kit("define/index.js"), compose: kit("compose/index.js") },
  makeUrl: (text) => `data:text/javascript;base64,${Buffer.from(text).toString("base64")}`,
  importUrl: (url) => import(url),
};
const pkgs = (/** @type {string[]} */ names) => Object.fromEntries(names.map((n) => [n, readPackageDir(`${ROOT}${DRAW}/${n}`)]));

async function arcade() {
  const w = await loadWorkbench({ packages: pkgs(["maze", "particles", "arcade"]), glue: { path: "workbench.js", text: readFileSync(`${ROOT}${DRAW}/workbench.js`, "utf8") } }, env);
  assert.deepEqual(w.diagnostics.filter((d) => d.severity === "error"), []);
  return w;
}

/** @param {import("../load.js").Loaded} w */
function mount(w) {
  const ctx = fakeContext(), f = frames();
  /** @type {any[]} */
  const seen = [];
  const s = createSession(w, { context: ctx, requestFrame: f.requestFrame, onFrame: (snap) => seen.push(snap), decode: async () => ({}) });
  return { s, ctx, f, seen };
}
const play = (/** @type {ReturnType<typeof frames>} */ f, /** @type {number} */ to) => { for (let ms = 0; ms <= to; ms += 16) f.tick(ms); };

test("frames advance the run, draw the shown list, and give the panels a snapshot of every part", async () => {
  const { s, ctx, f, seen } = mount(await arcade());
  await s.page.ready;
  s.start();
  play(f, 500);
  assert.ok(s.page.run.seconds > 0.3);
  assert.ok(ctx.calls.some((/** @type {unknown[]} */ c) => c[0] === "fillRect" || c[0] === "ellipse"));
  const snap = seen.at(-1);
  assert.deepEqual(snap.parts.map((/** @type {any} */ p) => p.part), ["dungeon", "sparks", "screen"]);
  assert.equal(snap.parts[0].tiles[0].id, "score");
  assert.ok(snap.parts[0].traces.some((/** @type {any} */ t) => t.path === "t"));
  assert.ok(snap.head >= snap.status.seconds);
});

test("pause stops the run, step runs one instant, and the scrubber rewinds and runs forward to the furthest point", async () => {
  const { s, f } = mount(await arcade());
  await s.page.ready;
  s.start();
  play(f, 1000);
  s.pause();
  const at = s.page.run.seconds;
  s.step();
  assert.ok(s.page.run.seconds > at);
  const head = s.snapshot().head;
  s.scrub(head / 2);
  assert.ok(Math.abs(s.page.run.seconds - head / 2) < 0.2, `${s.page.run.seconds}`);
  assert.equal(s.page.driver.paused, true);
  s.scrub(1e9);
  assert.ok(Math.abs(s.page.run.seconds - head) < 0.2);
  assert.match(s.why(), /^why/);
});

test("a param edit and a UI button are logged inputs; a key is a page control", async () => {
  const w = await loadPreset({ packages: pkgs(["particles"]), package: "particles", example: "examples/01.js" }, env);
  const a = mount(w);
  a.s.setParam("fountain", "rate", 10);
  a.s.page.run.runUntil(2);
  assert.ok(a.s.page.run.log.inputs.some((/** @type {any} */ i) => i.kind === "param" && i.name === "rate" && i.value === 10));
  assert.equal(a.s.snapshot().parts[0].params.rate, 10);
  const m = mount(await loadPreset({ packages: pkgs(["maze"]), package: "maze", example: "examples/01.js" }, env));
  // the control's name is the UI's (kit/define's ui.control), not the host's to make from the object's
  m.s.control(m.s.snapshot().parts[0].part, { right: true });
  assert.ok(m.s.page.run.log.inputs.some((/** @type {any} */ i) => i.kind === "control" && i.name === "pad" && i.value.right === true));
  assert.equal(m.s.key({ type: "keydown", code: "KeyP" }), false);
});

test("the snapshot's params are the run's: a rewind to before an edit shows the declared value again (review H1)", async () => {
  const w = await loadPreset({ packages: pkgs(["particles"]), package: "particles", example: "examples/01.js" }, env);
  const { s, f } = mount(w);
  await s.page.ready;
  s.start();
  for (let ms = 0; ms <= 1000; ms += 16) f.tick(ms);
  assert.deepEqual(s.setParam("fountain", "rate", 10), []);
  for (let ms = 1016; ms <= 2000; ms += 16) f.tick(ms);
  assert.equal(s.snapshot().parts[0].params.rate, 10);
  s.scrub(0.3);
  assert.equal(s.snapshot().parts[0].params.rate, 60, "the rewind dropped the edit, so $ is the declared value");
  assert.deepEqual(s.snapshot().parts[0].params, s.page.run.params("fountain"));
});

test("a param edit outside the param's range is refused with N008, never logged, and the page keeps running (review H2)", async () => {
  const w = await loadPreset({ packages: pkgs(["particles"]), package: "particles", example: "examples/02.js" }, env);
  const { s, f } = mount(w);
  await s.page.ready;
  s.start();
  let ms = 0;
  for (; ms <= 500; ms += 16) f.tick(ms);
  const logged = s.page.run.log.inputs.length;
  for (const [name, value] of /** @type {const} */ ([["vents", 9], ["puff", 500], ["vents", "4"]])) {
    const refused = s.setParam("smoke", name, value);
    assert.deepEqual(refused.map((d) => d.code), ["N008"], `${name} = ${value}`);
  }
  assert.equal(s.page.run.log.inputs.length, logged);
  assert.deepEqual(s.setParam("smoke", "vents", 4), [], "a value inside the range still applies");
  for (; ms <= 1000; ms += 16) f.tick(ms);
  assert.equal(s.page.status().halted, null);
  assert.equal(s.snapshot().parts[0].params.vents, 4);
  assert.equal(s.page.run.state("smoke").emitters.length, 4);
});

test("a sweep runs asynchronously, keyed by part and component id, with its progress; a rerun cancels the one before (review M3, M4.6)", async () => {
  const w = await loadPreset({ packages: pkgs(["particles"]), package: "particles", example: "examples/01.js" }, env);
  const { s } = mount(w);
  const part = s.snapshot().parts[0];
  const runs = part.tiles.flatMap((t) => t.body).find((c) => c.kind === "runs");
  assert.ok(runs, "the particles UI has a runs tile");
  const spec = { ...runs.spec, steps: 3, seconds: 1 };
  assert.equal(s.sweepState("fountain", spec), null);
  const first = s.sweep("fountain", { ...spec, seconds: 30 });
  assert.equal(s.sweepState("fountain", spec)?.running, true);
  const second = s.sweep("fountain", spec);
  assert.deepEqual(await first, { points: [], cancelled: true });
  const r = await second;
  assert.equal(r.points.length, 3);
  const state = s.sweepState("fountain", spec);
  assert.equal(state?.running, false);
  assert.equal(state?.progress, 1);
  assert.deepEqual(state?.result, r);
  // another part's component with the same label is another key
  assert.equal(s.sweepState("other", spec), null);
  assert.equal(s.sweepState("fountain", { ...spec, y: "tiles.other.body[0].y" }), null);
  s.cancelSweep("fountain", spec); // nothing running: nothing to cancel
});

test("stop() aborts every running sweep: afterward none notifies and onFrame never fires again (review g21AQF)", async () => {
  const w = await loadPreset({ packages: pkgs(["particles"]), package: "particles", example: "examples/01.js" }, env);
  const { s, seen } = mount(w);
  const runs = s.snapshot().parts[0].tiles.flatMap((t) => t.body).find((c) => c.kind === "runs");
  const spec = { ...runs?.spec, steps: 3, seconds: 20 };
  const done = s.sweep("fountain", spec);
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(s.sweepState("fountain", spec)?.running, true);
  s.stop();
  const before = seen.length;
  assert.deepEqual(await done, { points: [], cancelled: true });
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(seen.length, before, "no frame after stop");
  assert.equal(s.sweepState("fountain", spec)?.running, false, "the aborted sweep is marked done, silently");
});

test("a snapshot or panel that throws every frame is one reported problem, and the frames go on (review LOW)", async () => {
  const w = await loadPreset({ packages: pkgs(["particles"]), package: "particles", example: "examples/01.js" }, env);
  const f = frames();
  /** @type {string[]} */
  const problems = [];
  let calls = 0;
  const s = createSession(w, { context: fakeContext(), requestFrame: f.requestFrame, decode: async () => ({}), onFrame: () => { calls++; throw new Error("the panel broke"); }, onProblem: (m) => problems.push(m) });
  await s.page.ready;
  s.start();
  for (let ms = 0; ms <= 500; ms += 16) f.tick(ms);
  assert.ok(calls > 10, "the frames went on");
  assert.deepEqual(problems, ["the panels threw: the panel broke"]);
});

test("a session on a workbench that did not build refuses", async () => {
  const w = await loadWorkbench({ packages: {}, glue: { path: "g.js", text: "export default () => 1;" } }, env);
  assert.throws(() => mount(w), /did not build/);
});
