// A layer in a run (kit/compose README, "Layers"): never stepped, logged, hashed or counted; its output, wherever
// it is read, is each input wire's list carried as any Draw wire's is (converted op by op into the bottom
// producer's frame) and concatenated bottom first. pageView and snapshot follow the bottom producer, through a
// layer at the bottom; a delayed wire from a layer reads every producer under it as the instant began. A record
// whose layer has inputs from no producer is refused (N007), never drawn empty.

import { test } from "node:test";
import assert from "node:assert/strict";
import { defineRuntime } from "../../define/index.js";
import { compose, layer } from "../../compose/index.js";
import { createRun, pageView, RunError } from "../index.js";
import { drawnMaze, screen, GRID } from "../../draw/fixtures/draw-dialects.js";
import { mazeStep } from "./helpers.js";

const right = "(pl, pad) => { pl.dx = 1; }";

/**
 * The maze `level` (in cells, 8 pixels a cell from the screens' pixels) and screens in pixels, each with a runtime.
 * `glue(c, handles)` finishes the composition.
 * @param {(c: any, h: { level: any, scr: any, hud: any }) => any} glue @param {{ hudFirst?: boolean }} [o]  `hudFirst`: hud is added before the others
 */
function bench(glue, o = {}) {
  // hud is its own Dialect, whose board takes a whole layer of the two
  const mg = drawnMaze(), sg = screen(), hg = screen((d) => { d.name = "hud"; d.ports.in.board.seam = "Draw<79>@px"; });
  const coinsOf = (/** @type {string[]} */ grid) => grid.flatMap((row, y) => [...row].flatMap((ch, x) => (ch === "c" ? [{ x, y }] : [])));
  const runtimes = [
    defineRuntime(mg, {
      clock: () => ({ tick: 1 / 8 }),
      init: (/** @type {any} */ r) => ({ t: 0, score: 0, player: { x: 1, y: 1 }, home: [1, 1], grid: r.grid, coins: coinsOf(r.grid) }),
      step: (/** @type {any} */ s, /** @type {any} */ ctx) => { const n = mazeStep(s, ctx); return { ...n, coins: coinsOf(n.grid) }; },
      events: { out: { picked: 8 } },
    }),
    ...[sg, hg].map((g) => defineRuntime(g, { clock: () => ({ tick: 1 / 8 }), init: () => ({ t: 0 }), step: (/** @type {any} */ s, /** @type {any} */ ctx) => ({ t: s.t + ctx.dt }) })),
  ];
  const level = /** @type {any} */ (mg("level")).grid(GRID).control(right);
  const scr = /** @type {any} */ (sg("scr")).size({ width: 40, height: 32 });
  const hud = /** @type {any} */ (hg("hud")).size({ width: 40, height: 32 });
  const c = (o.hudFirst ? compose("layer-run").part(hud) : compose("layer-run")).part(level).part(scr)
    .frame(level.frame.cell, scr.frame.px, { scale: 8, offset: 4 });
  const composed = glue(c, { level, scr, hud }).build();
  return { composed, runtimes, run: createRun(composed, { runtimes }) };
}

const TEXT = { op: "text", at: [0, 24], str: "SCORE 0", font: "mono", fill: "#ffffffff" };
const TILES = { op: "tiles", at: [0, 0], image: "level.sheet", grid: ["#####", "#.c.#", "#####"], key: { "#": 0, ".": 1, c: 1 }, size: [8, 8] };
const DISC = { op: "ellipse", at: [20, 12], r: [2, 2], fill: "#ffd23fff" };

test("a shown layer draws the bottom producer's ops, then the top's converted into the bottom frame, in the bottom's box", () => {
  const { composed, runtimes, run } = bench((c, { level, scr }) => c.show(layer("top", scr.out.view, level.out.view)));
  const v = pageView(run, composed, runtimes);
  assert.equal(v.part, "top");
  assert.equal(v.port, "view");
  assert.deepEqual(v.box, { min: [0, 0], max: [40, 32] }, "the screen's pixel extent");
  assert.deepEqual(v.list, [TEXT, TILES, DISC]);
  assert.deepEqual(v.images, { "level.sheet": { size: [16, 8], cell: [8, 8], note: "a wall, then the floor" } });
  // the coin is picked at the first tick, so its disc is gone
  run.runUntil(0.125);
  assert.deepEqual(pageView(run, composed, runtimes).list.map((op) => op.op), ["text", "tiles"]);
  assert.deepEqual(run.diagnostics.filter((d) => d.severity === "error"), []);
});

test("the shorthand's layer draws the same, and the box follows the bottom producer, in its frame", () => {
  const { composed, runtimes, run } = bench((c, { level, scr }) => c.show(level.out.view, scr.out.view));
  const v = pageView(run, composed, runtimes);
  assert.equal(v.part, "layers");
  assert.deepEqual(v.box, { min: [-0.5, -0.5], max: [4.5, 2.5] }, "the maze's cell extent");
  assert.deepEqual(v.list.map((op) => op.op), ["tiles", "ellipse", "text"]);
  assert.deepEqual(v.list[2].at, [-0.5, 2.5], "the text at (0, 24) px is at (-0.5, 2.5) in cells");
});

test("a layer is never stepped: it needs no runtime, and is not in the hashes, the log, the stats or the composition key", () => {
  const { composed, run } = bench((c, { level, scr }) => c.show(layer("top", scr.out.view, level.out.view)));
  run.runUntil(0.5);
  assert.deepEqual(Object.keys(run.hashes[0].parts), ["level", "scr"]);
  assert.deepEqual(run.log.inputs, []);
  assert.deepEqual(Object.keys(run.stats()).sort(), Object.keys(bench((c, { scr }) => c.show(scr)).run.stats()).sort());
  assert.equal(composed.parts.find((/** @type {any} */ p) => p.name === "top")?.dialect, "layer");
});

test("snapshot of a layer is its list now, with no state; state of a layer is null", () => {
  const { run } = bench((c, { level, scr }) => c.show(layer("top", scr.out.view, level.out.view)));
  const s = run.snapshot("top");
  assert.equal(s.state, null);
  assert.deepEqual(s.draws?.view, [TEXT, TILES, DISC]);
  assert.equal(run.state("top"), null);
});

test("a layered output wired into a part's Draw input reaches it converted, and a layer of a layer draws through", () => {
  const { composed, runtimes, run } = bench((c, { level, scr, hud }) => {
    const top = layer("top", scr.out.view, level.out.view);
    return c.frame(scr.frame.px, hud.frame.px, { scale: 1, offset: [0, 0] }).wire(top.out.view, hud.in.board).show(hud);
  }, { hudFirst: true });
  run.runUntil(0.125);
  // hud, added first, steps after both producers under the layer, so it read the list of this instant: the coin is gone
  assert.deepEqual(pageView(run, composed, runtimes).list.map((op) => op.op), ["text", "tiles", "text"]);
  const nested = bench((c, { level, scr }) => {
    const under = layer("under", scr.out.view, level.out.view);
    return c.show(layer("over", under.out.view, scr.out.view));
  });
  const v = pageView(nested.run, nested.composed, nested.runtimes);
  assert.deepEqual(v.box, { min: [0, 0], max: [40, 32] }, "followed down to the screen at the bottom of the bottom layer");
  assert.deepEqual(v.list, [TEXT, TILES, DISC, TEXT]);
});

test("a delayed wire from a layer reads every producer under it as the instant began", () => {
  const undelayed = bench((c, { level, scr, hud }) => c.part(hud).frame(scr.frame.px, hud.frame.px, { scale: 1, offset: [0, 0] }).wire(layer("top", scr.out.view, level.out.view).out.view, hud.in.board).show(hud));
  const delayed = bench((c, { level, scr, hud }) => c.part(hud).frame(scr.frame.px, hud.frame.px, { scale: 1, offset: [0, 0] }).wire(layer("top", scr.out.view, level.out.view).out.view, hud.in.board, { delay: true }).show(hud));
  // the first instant is T = 0, where the maze picks the coin
  undelayed.run.runUntil(0);
  delayed.run.runUntil(0);
  const ops = (/** @type {any} */ b) => pageView(b.run, b.composed, b.runtimes).list.map((/** @type {any} */ op) => op.op);
  assert.deepEqual(ops(undelayed), ["text", "tiles", "text"]);
  assert.deepEqual(ops(delayed), ["text", "tiles", "ellipse", "text"], "the disc as the instant began");
});

test("a rewound run draws the layer as the straight run did", () => {
  const { composed, runtimes, run } = bench((c, { level, scr }) => c.show(layer("top", scr.out.view, level.out.view)));
  run.runUntil(1);
  const straight = pageView(run, composed, runtimes).list;
  run.rewind(0).runUntil(1);
  assert.deepEqual(pageView(run, composed, runtimes).list, straight);
});

test("a layer whose inputs come from no producer is refused (N007), never drawn empty", () => {
  const { composed, runtimes } = bench((c, { level, scr }) => c.show(layer("top", scr.out.view, level.out.view)));
  const without = { ...composed, wires: composed.wires.filter((/** @type {any} */ w) => w.to !== "top.in.1") };
  assert.throws(() => createRun(without, { runtimes }), (e) => e instanceof RunError && e.diagnostics.some((d) => d.code === "N007" && /layer 'top'.*in\.1/.test(d.message)));
  const strange = { ...composed, wires: composed.wires.map((/** @type {any} */ w) => (w.to === "top.in.0" ? { ...w, from: "ghost.out.view" } : w)) };
  assert.throws(() => createRun(strange, { runtimes }), (e) => e instanceof RunError && e.diagnostics.some((d) => d.code === "N007" && /ghost/.test(d.message)));
  const notDraw = { ...composed, wires: composed.wires.map((/** @type {any} */ w) => (w.to === "top.in.1" ? { ...w, from: "level.out.score" } : w)) };
  assert.throws(() => createRun(notDraw, { runtimes }), (e) => e instanceof RunError && e.diagnostics.some((d) => d.code === "N007" && /level\.out\.score/.test(d.message)));
  const one = { ...composed, parts: composed.parts.map((/** @type {any} */ p) => (p.name === "top" ? { ...p, layer: { ...p.layer, inputs: ["scr.out.view"] } } : p)), wires: composed.wires.filter((/** @type {any} */ w) => w.to !== "top.in.1") };
  assert.throws(() => createRun(one, { runtimes }), (e) => e instanceof RunError && e.diagnostics.some((d) => d.code === "N007" && /1 inputs, not two or more/.test(d.message)));
  // two layers that feed each other would never end
  const nested = bench((c, { level, scr }) => { const under = layer("under", scr.out.view, level.out.view); return c.show(layer("over", under.out.view, scr.out.view)); });
  const ring = { ...nested.composed, wires: nested.composed.wires.map((/** @type {any} */ w) => (w.to === "under.in.0" ? { ...w, from: "over.out.view" } : w)) };
  assert.throws(() => createRun(ring, { runtimes: nested.runtimes }), (e) => e instanceof RunError && e.diagnostics.some((d) => d.code === "N007" && /drawn from itself/.test(d.message)));
  // and the record as built runs
  assert.doesNotThrow(() => createRun(composed, { runtimes }));
});
