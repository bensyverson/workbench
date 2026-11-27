// The UI of the draw trial's particles and maze packages, read against their runs' states: the values are kit/define's
// compiled UI's (ui.compile), the sweep kit/page's; the host shows them as text and keeps the plot histories.

import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { readPackageDir } from "../../../../scripts/pkg/dir.js";
import { createRun } from "../../../run/index.js";
import { sweepRuns } from "../../index.js";
import { loadPreset } from "../load.js";
import { shownTiles, shown, paramValues, SeriesStore, numberPaths, readPath } from "../ui-eval.js";

const kit = (/** @type {string} */ p) => new URL(`../../../${p}`, import.meta.url).href;
/** @type {import("../load.js").LoadEnv} */
const env = {
  urls: { define: kit("define/index.js"), compose: kit("compose/index.js") },
  makeUrl: (text) => `data:text/javascript;base64,${Buffer.from(text).toString("base64")}`,
  importUrl: (url) => import(url),
};
const dir = (/** @type {string} */ n) => readPackageDir(fileURLToPath(new URL(`../../../../scripts/draw-trial/massaged/2026-11-26-compose/${n}`, import.meta.url)));

async function fountain() {
  const w = await loadPreset({ packages: { particles: dir("particles") }, package: "particles", example: "examples/01.js" }, env);
  assert.deepEqual(w.diagnostics, []);
  const run = createRun(w.composed, { runtimes: w.runtimes });
  run.runUntil(1);
  const ui = w.packages[0].loaded.ui;
  const record = w.composed.parts[0].record;
  const compiled = ui.compile(record);
  assert.deepEqual(compiled.diagnostics, [], "the particles UI lowers against the example");
  return { w, run, ui, record, compiled, state: run.state("fountain"), $: paramValues(record) };
}

test("tiles evaluate through the kit and show as text: stat, row, check, table, plot, runs and text", async () => {
  const { compiled, state, $ } = await fountain();
  const tiles = shownTiles(compiled.evaluate(state, $).tiles);
  assert.deepEqual(tiles.map((t) => t.id), ["health", "sweep"]);
  const [row, check, table, plot] = tiles[0].body;
  assert.equal(row.kind, "row");
  assert.equal(row.items[0].text, String(state.particles.length));
  assert.equal(row.items[1].unit, "s");
  assert.equal(check.ok, state.particles.length < state.maxParticles);
  assert.deepEqual(table.columns, ["name", "live", "share"]);
  assert.equal(table.rows.length, state.emitters.length);
  assert.ok(table.rows.every((/** @type {unknown[]} */ r) => r.every((x) => typeof x === "string")), "cells are text");
  assert.equal(plot.y, state.particles.length);
  assert.equal(tiles[1].body[0].kind, "text");
  assert.equal(tiles[1].body[1].kind, "runs");
});

test("a shown component keeps the kit's error, and a number shows to three places", () => {
  assert.deepEqual(shown({ kind: "stat", label: "n", error: "L002 boom", code: "L002" }), { kind: "stat", label: "n", error: "L002 boom" });
  assert.deepEqual(shown({ kind: "stat", label: "n", value: 1 / 3, max: 2, bad: false }), { kind: "stat", label: "n", text: "0.333", unit: "", max: "2", bad: false });
});

test("a runs tile sweeps the param, clamped, from fresh runs (kit/page's sweepRuns)", async () => {
  const { w, compiled, state, $ } = await fountain();
  const spec = /** @type {any} */ (compiled.evaluate(state, $).tiles[1].body[1]);
  const r = sweepRuns({ composed: w.composed, runtimes: w.runtimes, part: "fountain", spec: { ...spec, steps: 3, seconds: 1, to: 1000 }, compiled });
  assert.equal(r.error, undefined);
  assert.deepEqual(r.points.map((p) => p.x), [0, 400, 400]);
  assert.ok(r.points[2].y > r.points[0].y);
});

test("params and annotations resolve", async () => {
  const { compiled, state, record } = await fountain();
  assert.deepEqual(paramValues(record, { rate: 350 }), { rate: 350, wind: 0 });
  assert.deepEqual(compiled.annotation("params", "rate", state, { rate: 350, wind: 0 }), { tone: "dim", badge: "hot" });
  assert.deepEqual(compiled.annotation("params", "wind", state, { rate: 1, wind: 0 }), { tone: "dim" });
});

test("traces: the numbers outside lists, and a series store that follows a rewind", () => {
  assert.deepEqual(numberPaths({ t: 1, bounds: { width: 2 }, list: [1, 2], s: "x", n: null }), ["t", "bounds.width"]);
  assert.equal(readPath({ a: { b: 4 } }, "a.b"), 4);
  const s = new SeriesStore();
  for (const T of [0, 1, 2, 3]) s.add("k", T, T * 10, 2);
  assert.deepEqual(s.get("k").map((p) => p.T), [1, 2, 3]);
  s.add("k", 2, 99, 2);
  assert.deepEqual(s.get("k").map((p) => [p.T, p.y]), [[1, 10], [2, 99]]);
});

test("the maze's stats read its run", async () => {
  const w = await loadPreset({ packages: { maze: dir("maze") }, package: "maze", example: "examples/01.js" }, env);
  assert.deepEqual(w.diagnostics, []);
  const run = createRun(w.composed, { runtimes: w.runtimes });
  run.runUntil(1);
  const part = w.composed.parts[0];
  const tiles = shownTiles(w.packages[0].loaded.ui.compile(part.record).evaluate(run.state(part.name), paramValues(part.record)).tiles);
  assert.equal(tiles[0].body[0].label, "score");
  assert.equal(typeof tiles[0].body[2].ok, "boolean");
});
