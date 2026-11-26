// Draw lists in a run (the draw-list draft, as ruled 2026-11-26): each part's Draw outputs are built after its
// init and each step, from the state it committed, the record, its params and its inputs global (ruling 4); a Draw
// input reads its producer's list converted into its frame; the page reads the shown part's list with the images
// and the box a renderer needs; and a builder's failure stops its part with its J code, never a truncated list.

import { test } from "node:test";
import assert from "node:assert/strict";
import { defineRuntime } from "../../define/index.js";
import { compose } from "../../compose/index.js";
import { createRun, pageView } from "../index.js";
import { drawnMaze, screen, GRID } from "../../draw/fixtures/draw-dialects.js";
import { mazeStep } from "./helpers.js";

const right = "(pl, pad) => { pl.dx = 1; }";

/** @param {{ maze?: (d: any) => void, screen?: (d: any) => void }} [change] */
function bench(change = {}) {
  const mg = drawnMaze(change.maze), sg = screen(change.screen);
  const coinsOf = (/** @type {string[]} */ grid) => grid.flatMap((row, y) => [...row].flatMap((ch, x) => (ch === "c" ? [{ x, y }] : [])));
  const runtimes = [
    defineRuntime(mg, {
      clock: () => ({ tick: 1 / 8 }),
      init: (/** @type {any} */ r) => ({ t: 0, score: 0, player: { x: 1, y: 1 }, home: [1, 1], grid: r.grid, coins: coinsOf(r.grid) }),
      step: (/** @type {any} */ s, /** @type {any} */ ctx) => { const n = mazeStep(s, ctx); return { ...n, coins: coinsOf(n.grid) }; },
      events: { out: { picked: 8 } },
    }),
    defineRuntime(sg, { clock: () => ({ tick: 1 / 8 }), init: () => ({ t: 0 }), step: (/** @type {any} */ s, /** @type {any} */ ctx) => ({ t: s.t + ctx.dt }) }),
  ];
  const level = /** @type {any} */ (mg("level")).grid(GRID).control(right);
  const scr = /** @type {any} */ (sg("scr")).size({ width: 40, height: 32 });
  const composed = compose("draw-run").part(level).part(scr)
    .frame(level.frame.cell, scr.frame.px, { scale: 8, offset: 4 })
    .wire(level.out.view, scr.in.board).wire(level.out.score, scr.in.score).show(scr).build();
  return { composed, runtimes, run: createRun(composed, { runtimes }) };
}

test("the shown part's list layers its Draw input, converted, under its own ops", () => {
  const { composed, runtimes, run } = bench();
  const before = pageView(run, composed, runtimes);
  assert.equal(before.part, "scr");
  assert.equal(before.port, "view");
  assert.deepEqual(before.box, { min: [0, 0], max: [40, 32] });
  assert.deepEqual(before.images, { "level.sheet": { size: [16, 8], cell: [8, 8], note: "a wall, then the floor" } });
  run.runUntil(0.25);
  const v = pageView(run, composed, runtimes);
  assert.deepEqual(v.list.map((op) => op.op), ["tiles", "text"], "the coin was picked, so no disc is left");
  assert.deepEqual(v.list[0], { op: "tiles", at: [0, 0], image: "level.sheet", grid: ["#####", "#...#", "#####"], key: { "#": 0, ".": 1, c: 1 }, size: [8, 8] });
  assert.deepEqual(v.list[1], { op: "text", at: [0, 24], str: "SCORE 1", font: "mono", fill: "#ffffffff" });
  assert.deepEqual(run.diagnostics.filter((d) => d.severity === "error"), []);
});

test("before the first instant, a part's list is its init picture, with its disc", () => {
  const { composed, runtimes, run } = bench();
  const level = pageView(run, composed, runtimes, "level");
  assert.deepEqual(level.list.map((op) => op.op), ["tiles", "ellipse"]);
  assert.deepEqual(level.list[1], { op: "ellipse", at: [2, 1], r: [0.25, 0.25], fill: "#ffd23fff" });
});

test("a builder over its max or making a bad op stops its part with its J code", () => {
  const over = bench({ maze: (d) => { d.ports.out.view.layers[0].from = () => [{ op: "rect", at: [0, 0], size: [1, 1] }, { op: "rect", at: [0, 0], size: [1, 1] }, { op: "rect", at: [0, 0], size: [1, 1] }, { op: "rect", at: [0, 0], size: [1, 1] }]; } }).run;
  over.runUntil(0.25);
  const j = over.diagnostics.filter((d) => d.code === "J021");
  assert.equal(j.length, 1);
  assert.equal(j[0].part, "level");
  assert.match(j[0].message, /part 'level' \(maze\): out\.view: the draw list has 5 ops, and its max is 4/);
  const bad = bench({ maze: (d) => { d.ports.out.view.layers[1].from = (/** @type {any} */ c) => ({ op: "ellipse", at: [c.x, c.y], fill: "coin" }); } }).run;
  bad.runUntil(0.25);
  assert.match(bad.diagnostics.find((d) => d.code === "J020")?.message ?? "", /op 1: an ellipse needs r/);
});
