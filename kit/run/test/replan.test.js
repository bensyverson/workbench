// The re-plan on rebuild (kit/compose README, "An anchored edge" ▸ "How kit/run sees a rebuilt extent"; Ben's ruling,
// 2026-11-27; leaves Wd9nH5 and QqirvU): after a rebuild that changes a part's record, kit/run plans every wire's
// conversions again from the composed record's `frames`, with each Dialect's edges(record) and each "fit" or anchored
// edge computed for the records now in force, and pageView's box comes from the record in force. A plan that fails
// fails the rebuild: the previous revision runs on, and the build event carries the S diagnostic. Records already
// queued keep the conversion they got when they crossed. The build event names each edge that moved.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createRun, replay, pageView } from "../index.js";
import { defineRuntime, list } from "../../define/index.js";
import { compose, layer } from "../../compose/index.js";
import { fitEdge } from "../../seam/index.js";
import { drawnMaze, screen, GRID } from "../../draw/fixtures/draw-dialects.js";
import { mazeKit, fxKit, mazeStep, rightAt, tiny, CORRIDOR, STEER, SPAWN } from "./helpers.js";

const LONG = ["#########", "#..cc.cc#", "#########"];
/** The seams maze's cell extent for a grid. @param {string[]} g */
const cells = (g) => ({ min: [-0.5, -0.5], max: [g[0].length - 0.5, g.length - 0.5] });
const BOUNDS = { min: [0, 0], max: [320, 320] };

/** The coin bursts on the corridor with a "fit" edge (its scale follows the grid's size); fx steps every 1/4 s. */
function fitBursts() {
  const M = mazeKit(), F = fxKit({ clock: { tick: 1 / 4 }, max: 16 });
  const l = /** @type {any} */ (M.grammar("level").grid(CORRIDOR).control(STEER));
  const f = /** @type {any} */ (F.grammar("fx").bounds({ width: 320, height: 320 }).emitter("pop", { x: 160, y: 160, trigger: "burst" }).rate("(t, live) => 0").spawn(SPAWN));
  const runtimes = [M.runtime, F.runtime];
  const composed = compose("fit-bursts").part(l).part(f).frame(l.frame.cell, f.frame.px, "fit").wire(l.out.picked, f.in.burst).build({ runtimes });
  const long = /** @type {any} */ (M.grammar("level").grid(LONG).control(STEER)).build();
  const inputs = [rightAt(0), { kind: "rebuild", T: 0.2, part: "level", record: long }, rightAt(0.2)];
  return { composed, runtimes, inputs, long };
}
/** A cell point by an edge. @param {{ scale: number[], offset: number[] }} e @param {number[]} p */
const by = (e, p) => p.map((v, i) => v * e.scale[i] + e.offset[i]);

test("Wd9nH5: a rebuild that changes an extent moves a fit edge: records sent after it convert by the new fit, one queued before keeps the old", () => {
  const { composed, runtimes, inputs } = fitBursts();
  const run = createRun(composed, { runtimes, inputs });
  run.runUntil(1);
  assert.equal(run.builds[0].ok, true);
  const before = fitEdge(cells(CORRIDOR), BOUNDS), after = fitEdge(cells(LONG), BOUNDS);
  const seen = run.state("fx").seen.map((/** @type {any} */ s) => [s.T, s.x, s.y]);
  // the pick at 1/8 crossed under the corridor's fit; the long grid's picks at 3/8, 1/2, 3/4 and 7/8 under its own
  const want = [[0.25, ...by(before, [3, 1])], [0.5, ...by(after, [3, 1])], [0.5, ...by(after, [4, 1])], [0.75, ...by(after, [6, 1])], [1, ...by(after, [7, 1])]];
  assert.equal(seen.length, want.length, JSON.stringify(seen));
  seen.forEach((/** @type {number[]} */ s, /** @type {number} */ i) => s.forEach((v, j) => assert.ok(Math.abs(v - want[i][j]) < 1e-9, `record ${i}: ${JSON.stringify(s)} against ${JSON.stringify(want[i])}`)));
});

test("the build event names each edge that moved, { from, to, before, after }, and the why text says so; a rebuild that keeps the key moves none", () => {
  const { composed, runtimes, inputs } = fitBursts();
  const run = createRun(composed, { runtimes, inputs });
  run.runUntil(1);
  const e = /** @type {any} */ (run.builds[0]);
  assert.deepEqual(e.edges.map((/** @type {any} */ x) => [x.from, x.to]), [["level.cell", "fx.px"]]);
  const near = (/** @type {number[]} */ a, /** @type {number[]} */ b) => a.every((v, i) => Math.abs(v - b[i]) < 1e-9);
  assert.ok(near(e.edges[0].before.scale, fitEdge(cells(CORRIDOR), BOUNDS).scale) && near(e.edges[0].after.scale, fitEdge(cells(LONG), BOUNDS).scale));
  assert.match(run.why("level"), /edges: +level\.cell → fx\.px \{ scale: [\d.]+, offset: \[[\d., ]+\] \} → \{ scale: [\d.]+, offset: \[[\d., ]+\] \}/);
  const same = createRun(composed, { runtimes, inputs: [{ kind: "rebuild", T: 0.1, part: "level", record: structuredClone(composed.parts[0].record) }] });
  same.runUntil(0.5);
  assert.equal(/** @type {any} */ (same.builds[0]).edges, undefined);
});

test("run.composed is the composed record in force: each part's record now, and each wire's conversions as last planned", () => {
  const { composed, runtimes, inputs, long } = fitBursts();
  const run = createRun(composed, { runtimes, inputs });
  assert.deepEqual(run.composed.wires[0].convert, composed.wires[0].convert);
  run.runUntil(1);
  assert.deepEqual(run.composed.parts[0].record, long);
  assert.deepEqual(run.composed.wires[0].convert[0].scale, fitEdge(cells(LONG), BOUNDS).scale);
  assert.deepEqual(composed.wires[0].convert[0].scale, fitEdge(cells(CORRIDOR), BOUNDS).scale, "the record given is never changed");
});

test("a replay plans the same, and a rewind past the rebuild restores the earlier plan with the earlier record", () => {
  const { composed, runtimes, inputs } = fitBursts();
  const run = createRun(composed, { runtimes, inputs });
  run.runUntil(1);
  const straight = run.state("fx").seen;
  assert.equal(replay(composed, { runtimes }, run.record()).ok, true);
  // back to 1/2: the checkpoint at 0 (before the rebuild) is restored, then the log is run again, the rebuild with it
  run.rewind(0.5);
  run.runUntil(1);
  assert.deepEqual(run.state("fx").seen, straight);
  // back before the rebuild: the plan is the record's own again (a rewind drops the inputs after its target)
  run.rewind(0.125);
  assert.deepEqual(run.composed.wires[0].convert, composed.wires[0].convert);
  assert.deepEqual(run.composed.parts[0].record, composed.parts[0].record);
});

/** A part `a` whose cell → px edge is its record's size, wired to `b` in its q; `.frame(a.px, b.q)`, and with `loop` a second glue path a.cell → b.q. @param {{ loop?: boolean }} [o] */
function edged(o = {}) {
  const A = tiny("ed", {
    state: { n: "f64" }, inputs: false,
    frames: { cell: { dims: 2, note: "cells" }, px: { dims: 2, note: "pixels" } },
    edges: (/** @type {any} */ r) => [{ from: "cell", to: "px", scale: r.size, offset: 0 }],
    ports: { out: { e: { seam: "Event<{ at: point2@cell }>" } } },
  }, { clock: () => ({ tick: 1 / 4 }), init: () => ({ n: 0 }), step: (/** @type {any} */ s, /** @type {any} */ c) => { c.events.e.push({ at: [1, 1] }); return { n: s.n + 1 }; }, events: { out: { e: 1 } } });
  const B = tiny("eb", { state: { got: list("f64", 1000) }, inputs: false, frames: { q: { dims: 2, note: "q" } }, ports: { in: { e: { seam: "Event<{ at: point2@q }>" } } } },
    { clock: () => ({ tick: 1 / 4 }), init: () => ({ got: [] }), step: (/** @type {any} */ s, /** @type {any} */ c) => ({ got: [...s.got, ...c.inputs.e.map((/** @type {any} */ r) => r.at[0])] }), events: { in: { e: 4 } } });
  const a = /** @type {any} */ (A.grammar("a")).size(2), b = /** @type {any} */ (B.grammar("b"));
  let c = compose("edged").part(a).part(b);
  if (o.loop) c = c.frame(a.frame.cell, b.frame.q, { scale: 2 });
  c = c.frame(a.frame.px, b.frame.q, { scale: 1 }).wire(a.out.e, b.in.e);
  const runtimes = [A.runtime, B.runtime];
  return { composed: c.build({ runtimes }), runtimes, size: (/** @type {number} */ n) => /** @type {any} */ (A.grammar("a")).size(n).build() };
}

test("a Dialect's edges(record) follow a rebuild: the record's new size scales what crosses after it", () => {
  const { composed, runtimes, size } = edged();
  const run = createRun(composed, { runtimes, inputs: [{ kind: "rebuild", T: 0.3, part: "a", record: size(5) }] });
  run.runUntil(1);
  assert.equal(run.builds[0].ok, true);
  // a steps at 0 and 1/4 (×2), is rebuilt at 0.3, then steps at 1/2, 3/4 and 1 (×5); b takes each at its own step
  assert.deepEqual(run.state("b").got, [2, 2, 5, 5, 5]);
  assert.deepEqual(/** @type {any} */ (run.builds[0]).edges.map((/** @type {any} */ x) => [x.from, x.to, x.before.scale[0], x.after.scale[0]]), [["a.cell", "a.px", 2, 5]]);
});

test("a re-plan that fails (two paths that now disagree, S253) fails the rebuild: the previous revision runs on with its conversions", () => {
  const { composed, runtimes, size } = edged({ loop: true });
  const run = createRun(composed, { runtimes, inputs: [{ kind: "rebuild", T: 0.3, part: "a", record: size(3) }] });
  run.runUntil(1);
  const e = run.builds[0];
  assert.equal(e.ok, false);
  assert.deepEqual(e.diagnostics.map((/** @type {any} */ d) => d.code), ["S253"]);
  assert.match(/** @type {any} */ (e.diagnostics[0]).message, /disagree|another path/);
  assert.equal(run.snapshot("a").revision, 1);
  assert.deepEqual(run.state("b").got, [2, 2, 2, 2, 2]);
  assert.deepEqual(run.composed.parts[0].record, composed.parts[0].record);
  assert.match(run.why("a"), /FAILED[\s\S]*S253/);
});

// pictures: the drawn maze in cells (its extent follows its grid) and a 40 by 32 screen in pixels, 8 pixels a cell
const WIDE = ["#######", "#.c...#", "#######"];
/** @param {(c: any, h: { level: any, scr: any }) => any} glue */
function pictures(glue) {
  const mg = drawnMaze(), sg = screen();
  const coinsOf = (/** @type {string[]} */ grid) => grid.flatMap((row, y) => [...row].flatMap((ch, x) => (ch === "c" ? [{ x, y }] : [])));
  const runtimes = [
    defineRuntime(mg, { clock: () => ({ tick: 1 / 8 }), init: (/** @type {any} */ r) => ({ t: 0, score: 0, player: { x: 1, y: 1 }, home: [1, 1], grid: r.grid, coins: coinsOf(r.grid) }), step: (/** @type {any} */ s, /** @type {any} */ ctx) => { const n = mazeStep(s, ctx); return { ...n, coins: coinsOf(n.grid) }; }, events: { out: { picked: 8 } } }),
    defineRuntime(sg, { clock: () => ({ tick: 1 / 8 }), init: () => ({ t: 0 }), step: (/** @type {any} */ s, /** @type {any} */ ctx) => ({ t: s.t + ctx.dt }) }),
  ];
  const still = "(pl, pad) => { pl.dx = 0; }";
  const level = /** @type {any} */ (mg("level")).grid(GRID).control(still);
  const scr = /** @type {any} */ (sg("scr")).size({ width: 40, height: 32 });
  const composed = glue(compose("pictures").part(level).part(scr), { level, scr }).build({ runtimes });
  const wide = /** @type {any} */ (mg("level")).grid(WIDE).control(still).build();
  return { composed, runtimes, rebuildAt: (/** @type {number} */ T) => [{ kind: "rebuild", T, part: "level", record: wide }] };
}

test("Wd9nH5: the page box follows a rebuild that changes the shown part's extent", () => {
  const { composed, runtimes, rebuildAt } = pictures((c, { level }) => c.show(level));
  const run = createRun(composed, { runtimes, inputs: rebuildAt(0.2) });
  assert.deepEqual(pageView(run, composed, runtimes).box, cells(GRID));
  run.runUntil(0.5);
  assert.deepEqual(pageView(run, composed, runtimes).box, cells(WIDE));
});

test("an anchored picture follows a rebuilt extent: the screen in the level's top-right corner moves with the level's width", () => {
  const { composed, runtimes, rebuildAt } = pictures((c, { level, scr }) => c.frame(scr.frame.px, level.frame.cell, { scale: 1 / 8, anchor: ["max", "min"] }).show(layer("top", level.out.view, scr.out.view)));
  const run = createRun(composed, { runtimes, inputs: rebuildAt(0.2) });
  const textAt = () => /** @type {any} */ (pageView(run, composed, runtimes).list.find((op) => op.op === "text")).at;
  // the screen's text at (0, 24) px is 1/8 of that in cells, from the screen's box placed at the level's max x, min y
  assert.deepEqual(textAt(), [-0.5, 2.5]);
  run.runUntil(0.5);
  assert.deepEqual(textAt(), [1.5, 2.5]);
});

test("a layer's page box grows to the union of its inputs' placed boxes, and need not start at the origin", () => {
  const corner = pictures((c, { level, scr }) => c.frame(scr.frame.px, level.frame.cell, { scale: 1 / 8, anchor: ["max", "min"] }).show(layer("top", level.out.view, scr.out.view)));
  const run = createRun(corner.composed, { runtimes: corner.runtimes, inputs: corner.rebuildAt(0.2) });
  // the level spans [-0.5, -0.5]..[4.5, 2.5]; the screen, 5 by 4 cells, hangs below it to 3.5
  assert.deepEqual(pageView(run, corner.composed, corner.runtimes).box, { min: [-0.5, -0.5], max: [4.5, 3.5] });
  run.runUntil(0.5);
  assert.deepEqual(pageView(run, corner.composed, corner.runtimes).box, { min: [-0.5, -0.5], max: [6.5, 3.5] }, "and follows the rebuild");
  // a label placed under the bottom picture by the pair form is on the page
  const under = pictures((c, { level, scr }) => c.frame(scr.frame.px, level.frame.cell, { scale: 1 / 8, anchor: { from: ["center", "min"], to: ["center", "max"] } }).show(level.out.view, scr.out.view));
  assert.deepEqual(pageView(createRun(under.composed, { runtimes: under.runtimes }), under.composed, under.runtimes).box, { min: [-0.5, -0.5], max: [4.5, 6.5] });
});
