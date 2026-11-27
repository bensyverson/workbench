// @ts-nocheck: the fixture Grammar is built at run time, so its builder chains are untyped.
// A package's example run alone (leaf dXp5WO): examplePreset composes one example as a one-part composition shown on
// the page, built through kit/define's run so build-time reads of `$` are answered and recorded, and gives the
// rebuild kit/run calls when such a param changes. And sweepRuns, a `runs` tile's fresh runs, read through the UI's
// compiled Kernels. The page host used to call the example with `{}` and the tile's function itself.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createRun } from "../../run/index.js";
import { defineUI, name, data } from "../../define/index.js";
import { tiny } from "../../run/test/helpers.js";
import { examplePreset, sweepRuns, PAGE_CODES } from "../index.js";

// a param slot that takes a range, so a sweep has one to clamp to
const PARAM = { kind: "decl", args: [name("param"), data({ value: "number", min: "number", max: "number" })], as: "params" };
const W = tiny("w", { state: { size: "f64", t: "f64" }, inputs: false, ports: { out: {}, in: {} }, slots: { param: PARAM } }, {
  clock: () => ({ tick: 1 / 4 }),
  init: (/** @type {any} */ r) => ({ size: r.size ?? -1, t: 0 }),
  step: (/** @type {any} */ s, /** @type {any} */ ctx) => ({ size: s.size, t: s.t + ctx.dt * ctx.params.speed }),
});
const g = /** @type {any} */ (W.grammar);
/** Reads `n` at build time (the size), and `speed` only at run time. */
const buildTime = (/** @type {any} */ $) => g("box").param("n", { value: 3, min: 1, max: 9 }).param("speed", { value: 1, min: 0, max: 4 }).size($.n * 2);
/** Reads `$` only inside a lambda. */
const runTime = (/** @type {any} */ $) => g("box").param("speed", { value: 1, min: 0, max: 4 }).size(4).k("() => $.speed");

/** @param {any} p */
const built = (p) => p.composition.build({ runtimes: [W.runtime] });

test("an example that reads $ only in lambdas composes alone: one part, shown, no diagnostics", () => {
  const p = examplePreset("w", runTime);
  assert.deepEqual(p.diagnostics, []);
  assert.deepEqual(p.composition.check({ runtimes: [W.runtime] }), []);
  const composed = built(p);
  assert.deepEqual(composed.parts.map((/** @type {any} */ x) => x.name), ["box"]);
  assert.equal(composed.show, "box");
  const run = createRun(composed, { runtimes: [W.runtime], build: p.build });
  run.runUntil(1);
  assert.equal(run.state("box").size, 4);
  assert.ok(run.state("box").t > 0);
});

test("an example that reads $ at build time is built at the declared values, and a param edit rebuilds it", () => {
  const p = examplePreset("w", buildTime);
  assert.deepEqual(p.diagnostics, []);
  const composed = built(p);
  assert.deepEqual(composed.parts[0].record.reads.map((/** @type {any} */ r) => r.param), ["n"]);
  const run = createRun(composed, { runtimes: [W.runtime], build: p.build });
  run.runUntil(0.5);
  assert.equal(run.state("box").size, 6);
  run.input({ kind: "param", part: "box", name: "n", value: 5 });
  run.runUntil(1);
  assert.equal(run.state("box").size, 10, "the rebuild ran the example again with n = 5");
});

test("an example that does not build is its B diagnostics; one that is not ($) => chain is H005; neither composes", () => {
  const bad = examplePreset("w", (/** @type {any} */ $) => g("box").size($.missing));
  assert.equal(bad.composition, null);
  assert.deepEqual(bad.diagnostics.map((/** @type {any} */ d) => d.code), ["B003"]);
  for (const fn of [42, () => 7, () => { throw new Error("boom"); }]) {
    const p = examplePreset("w", /** @type {any} */ (fn));
    assert.equal(p.composition, null);
    assert.deepEqual(p.diagnostics.map((/** @type {any} */ d) => d.code), ["H005"]);
  }
  assert.match(examplePreset("w", () => { throw new Error("boom"); }).diagnostics[0].message, /boom/);
  assert.ok(Object.hasOwn(PAGE_CODES, "H005"));
});

test("a runs tile sweeps fresh runs, each value clamped to the param's range, y read through the UI's Kernels", async () => {
  const p = examplePreset("w", (/** @type {any} */ $) => g("box").param("speed", { value: 1, min: 0, max: 4 }).size(4));
  const composed = built(p);
  const ui = defineUI(g, { tiles: { s: { title: "S", place: { splitBelow: "stage" }, body: [
    { kind: "runs", label: "t by speed", param: "speed", from: 0, to: 8, steps: 3, seconds: 1, y: (/** @type {any} */ s, /** @type {any} */ $) => s.t + $.speed * 0 },
  ] } } });
  const compiled = ui.compile(composed.parts[0].record);
  const spec = /** @type {any} */ (compiled.evaluate({ size: 4, t: 0 }, { speed: 1 }).tiles[0].body[0]);
  const r = await sweepRuns({ composed, runtimes: [W.runtime], part: "box", spec, compiled, build: p.build });
  assert.deepEqual(r, { points: [{ x: 0, y: 0 }, { x: 4, y: 5 }, { x: 4, y: 5 }] });
});

/** A sweep of `speed` over `seconds` of run each, with a counting yield. @param {number} seconds @param {number} steps */
function longSweep(seconds, steps) {
  const p = examplePreset("w", (/** @type {any} */ $) => g("box").param("speed", { value: 1, min: 0, max: 4 }).size(4));
  const composed = built(p);
  const ui = defineUI(g, { tiles: { s: { title: "S", place: { splitBelow: "stage" }, body: [{ kind: "runs", label: "t", param: "speed", from: 0, to: 4, steps, seconds, y: "t" }] } } });
  const compiled = ui.compile(composed.parts[0].record);
  const spec = /** @type {any} */ (compiled.evaluate({ size: 4, t: 0 }, { speed: 1 }).tiles[0].body[0]);
  let yields = 0;
  return { o: { composed, runtimes: [W.runtime], part: "box", spec, compiled, build: p.build, budgetMs: 0, yieldFn: async () => { yields++; } }, yields: () => yields };
}

test("a sweep yields between runs and inside a long one, reports its progress, and gives the points an unchunked run gives (review M3)", async () => {
  const s = longSweep(10, 3);
  /** @type {number[]} */
  const progress = [];
  const r = await sweepRuns({ ...s.o, onProgress: (f) => progress.push(f) });
  assert.deepEqual(r, { points: [{ x: 0, y: 0 }, { x: 2, y: 20.5 }, { x: 4, y: 41 }] }); // 41 steps of 1/4 s, from T = 0
  assert.ok(s.yields() >= 3 * 10, `yielded ${s.yields()} times: at least once a run second`);
  assert.ok(progress.length > 3 && progress.every((f, i) => f > 0 && f <= 1 && (i === 0 || f >= progress[i - 1])), JSON.stringify(progress.slice(0, 5)));
  assert.equal(progress.at(-1), 1);
});

test("a sweep stops when its signal aborts: the points so far, cancelled, and no run after", async () => {
  const s = longSweep(10, 4);
  const ac = new AbortController();
  let seen = 0;
  const r = await sweepRuns({ ...s.o, signal: ac.signal, onProgress: (f) => { if (f >= 0.5) ac.abort(); seen = f; } });
  assert.equal(r.cancelled, true);
  assert.deepEqual(r.points.map((pt) => pt.x), [0, 4 / 3]);
  assert.ok(seen < 0.6, `it stopped at ${seen}`);
  const already = new AbortController();
  already.abort();
  assert.deepEqual(await sweepRuns({ ...s.o, signal: already.signal }), { points: [], cancelled: true });
});

test("a sweep of a param the Program lacks, or of a build-time param with no rebuild, says why and has no points", async () => {
  const p = examplePreset("w", buildTime);
  const composed = built(p);
  const ui = defineUI(g, { tiles: { s: { title: "S", place: { splitBelow: "stage" }, body: [{ kind: "runs", label: "r", param: "n", from: 1, to: 3, steps: 2, seconds: 1, y: "size" }] } } });
  const compiled = ui.compile(composed.parts[0].record);
  const spec = /** @type {any} */ (compiled.evaluate({ size: 0, t: 0 }, {}).tiles[0].body[0]);
  assert.deepEqual(await sweepRuns({ composed, runtimes: [W.runtime], part: "box", spec, compiled, build: p.build }), { points: [{ x: 1, y: 2 }, { x: 3, y: 6 }] });
  assert.match(String((await sweepRuns({ composed, runtimes: [W.runtime], part: "box", spec, compiled })).error), /read at build time/);
  assert.match(String((await sweepRuns({ composed, runtimes: [W.runtime], part: "box", spec: { ...spec, param: "nope" }, compiled })).error), /no param 'nope'/);
});
