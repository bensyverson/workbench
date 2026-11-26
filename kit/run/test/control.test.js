// Run control and replay: headless runs step frame parts at a nominal 60 Hz; the real-time driver caps workbench
// time per display frame, so T slows instead of anything dropping (R001), and logs each frame; a run is a pure
// function of the composed record, the params and the input log (R005 when a replay diverges); rewind replays from
// the nearest checkpoint; keepLast drops are counted.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRun, createDriver, replay } from "../index.js";
import { bursts, fxKit, mazeKit, mazeStep, rightAt } from "./helpers.js";

test("headless: a frame part steps every 1/60 s of workbench time, with that dt", () => {
  const { composed, runtimes } = bursts({ fx: fxKit({ clock: { frame: true }, max: 8 }) });
  const run = createRun(composed, { runtimes });
  /** @type {string[]} */
  const fxAt = [];
  while (run.seconds < 0.1) { const i = /** @type {any} */ (run.step()); if (i.stepped.includes("fx")) fxAt.push(i.T); }
  assert.deepEqual(fxAt.slice(0, 7), ["0", "1/60", "1/30", "1/20", "1/15", "1/12", "1/10"]);
  assert.ok(Math.abs(run.state("fx").t - 0.1) < 1e-12);
});

test("pause and step: a paused driver ignores display frames; step advances to the next instant", () => {
  const { composed, runtimes } = bursts();
  const run = createRun(composed, { runtimes, frames: "display" });
  const d = createDriver(run);
  d.pause();
  d.frame(0.5);
  assert.equal(run.seconds, 0);
  assert.equal(run.state("level").t, 0);
  d.step();
  assert.equal(run.snapshot("level").T, "0");
  d.step();
  assert.equal(run.snapshot("fx").T, "1/30");
  d.resume();
  d.frame(1 / 60);
  assert.ok(run.seconds > 1 / 30);
});

test("real time: a long frame is capped, T falls behind wall time, nothing is dropped, and R001 says how much", () => {
  const { composed, runtimes } = bursts();
  const run = createRun(composed, { runtimes, frames: "display", inputs: [rightAt(0)] });
  const d = createDriver(run, { catchUp: 1 / 15 });
  for (let i = 0; i < 10; i++) d.frame(1 / 60);
  for (let i = 0; i < 4; i++) d.frame(0.5); // a stalled tab: four half-second frames
  d.frame(1 / 60);
  // 10/60 + 4 × 1/15 + 1/60 of workbench time
  assert.ok(Math.abs(run.seconds - (11 / 60 + 4 / 15)) < 0.01, String(run.seconds));
  const frames = run.log.inputs.filter((/** @type {any} */ e) => e.kind === "frame");
  assert.equal(frames.length, 15);
  assert.equal(frames.filter((/** @type {any} */ e) => e.capped).length, 4);
  const r001 = run.diagnostics.filter((/** @type {any} */ x) => x.code === "R001");
  assert.equal(r001.length, 1);
  assert.match(r001[0].message, /ran at 0\.13× for 2 s of wall time/);
  assert.deepEqual(run.stats().slowdowns.map((/** @type {any} */ s) => [s.wall, s.ratio]), [[2, 0.133]]);
  // every pickup reached fx: no record was dropped by the slowdown
  assert.equal(run.state("fx").seen.length, run.state("level").score);
});

test("replay: the same record, params and log give the same per-instant state hashes, frames and caps included", () => {
  const { composed, runtimes } = bursts();
  const run = createRun(composed, { runtimes, frames: "display", seed: 3, inputs: [rightAt(0.2)] });
  const d = createDriver(run);
  for (let k = 0; k < 3; k++) for (const dt of [1 / 60, 1 / 60, 0.3, 1 / 60, 1 / 30, 0.2, 1 / 60]) d.frame(dt);
  const record = run.record();
  assert.ok(record.hashes.length > 10);
  const r = replay(composed, { runtimes }, record);
  assert.deepEqual(r.diagnostics, []);
  assert.equal(r.ok, true);
  assert.deepEqual(r.run.hashes, record.hashes);
});

test("R005: a replay that diverges names the first instant whose state hash differs", () => {
  const { composed, runtimes } = bursts();
  const run = createRun(composed, { runtimes, inputs: [rightAt(0)] });
  run.runUntil(1);
  let n = 0;
  const M = mazeKit({ step: (/** @type {any} */ s, /** @type {any} */ c) => (++n === 6 ? { ...mazeStep(s, c), score: 99 } : mazeStep(s, c)) });
  const r = replay(composed, { runtimes: [M.runtime, runtimes[1]], dev: false }, run.record());
  assert.equal(r.ok, false);
  assert.deepEqual(r.diagnostics.map((/** @type {any} */ x) => [x.code, x.T]), [["R005", "5/8"]]);
  assert.match(r.diagnostics[0].message, /level/);
});

test("rewind replays from the nearest checkpoint: the state at T is the state the run had at T", () => {
  const { composed, runtimes } = bursts();
  const run = createRun(composed, { runtimes, inputs: [rightAt(0), rightAt(2.6)], checkpointEvery: 0.5 });
  run.runUntil(1.3);
  const at = run.hashes.find((/** @type {any} */ h) => h.T === "9/8");
  const levelAt = run.state("level");
  run.runUntil(3);
  run.rewind(1.3);
  assert.equal(run.seconds, 1.3);
  assert.deepEqual(run.state("level"), levelAt);
  assert.deepEqual(run.hashes.find((/** @type {any} */ h) => h.T === "9/8"), at);
  assert.equal(run.hashes.at(-1)?.T, "13/10");
  assert.ok(run.checkpoints.length >= 3);
  // a rewind is a branch: inputs stamped after it are dropped
  assert.equal(run.log.inputs.some((/** @type {any} */ e) => e.T === "13/5"), false);
});

test("keepLast drops are counted, per wire, in stats and an R001", () => {
  const { composed, runtimes } = bursts({ fx: fxKit({ clock: { tick: 1 / 4 }, delivery: { keepLast: 1 }, max: 1 }) });
  const run = createRun(composed, { runtimes, inputs: [rightAt(0)] });
  run.runUntil(1);
  // two picks between fx's steps at 0 and 1/4: the older is dropped
  assert.deepEqual(run.state("fx").seen.map((/** @type {any} */ s) => s.x), [45]);
  assert.deepEqual(run.stats().dropped, { "level.out.picked → fx.in.burst": 1 });
  assert.match(run.diagnostics.find((/** @type {any} */ x) => x.code === "R001")?.message ?? "", /keeps the last 1/);
});
