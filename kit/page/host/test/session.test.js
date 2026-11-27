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

test("a session on a workbench that did not build refuses", async () => {
  const w = await loadWorkbench({ packages: {}, glue: { path: "g.js", text: "export default () => 1;" } }, env);
  assert.throws(() => mount(w), /did not build/);
});
