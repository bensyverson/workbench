// Draw lists after a rewind or a replay (leaf WNeULS): a list is a pure function of the committed state, the
// record, the params and the inputs, so a run rewound to any checkpoint and run on gives the straight run's state
// hashes, even for a consumer whose state depends on a Draw input; and so does a replay of the JSON round-tripped
// record (N005). Two parts that commit one state object each keep their own lists.

import { test } from "node:test";
import assert from "node:assert/strict";
import { defineRuntime } from "../../define/index.js";
import { compose } from "../../compose/index.js";
import { createRun, replay, pageView } from "../index.js";
import { drawnMaze, screen, GRID } from "../../draw/fixtures/draw-dialects.js";
import { mazeStep } from "./helpers.js";

const right = "(pl, pad) => { pl.dx = 1; }";
const coinsOf = (/** @type {string[]} */ grid) => grid.flatMap((row, y) => [...row].flatMap((ch, x) => (ch === "c" ? [{ x, y }] : [])));

/** A maze and a screen whose state counts the ops on its board input, through a plain or a delayed wire. @param {{ delay?: boolean, tick?: number }} [o] */
function bench(o = {}) {
  const mg = drawnMaze(), sg = screen((d) => { d.state.seen = "f64"; });
  const runtimes = [
    defineRuntime(mg, {
      clock: () => ({ tick: 1 / 8 }),
      init: (/** @type {any} */ r) => ({ t: 0, score: 0, player: { x: 1, y: 1 }, home: [1, 1], grid: r.grid, coins: coinsOf(r.grid) }),
      step: (/** @type {any} */ s, /** @type {any} */ ctx) => { const n = mazeStep(s, ctx); return { ...n, coins: coinsOf(n.grid) }; },
      events: { out: { picked: 8 } },
    }),
    defineRuntime(sg, {
      clock: () => ({ tick: o.tick ?? 1 / 8 }),
      init: () => ({ t: 0, seen: 0 }),
      // the consumer's state is a function of its Draw input
      step: (/** @type {any} */ s, /** @type {any} */ ctx) => ({ t: s.t + ctx.dt, seen: s.seen * 10 + ctx.inputs.board.length }),
    }),
  ];
  const level = /** @type {any} */ (mg("level")).grid(GRID).control(right);
  const scr = /** @type {any} */ (sg("scr")).size({ width: 40, height: 32 });
  const composed = compose("draw-restore").part(level).part(scr)
    .frame(level.frame.cell, scr.frame.px, { scale: 8, offset: 4 })
    .wire(level.out.view, scr.in.board, o.delay ? { delay: true } : {}).wire(level.out.score, scr.in.score).show(scr).build();
  return { composed, runtimes };
}

for (const o of [{}, { delay: true }, { tick: 1 / 5 }]) {
  test(`rewinding to any checkpoint and running on gives the straight run's hashes (${JSON.stringify(o)})`, () => {
    const { composed, runtimes } = bench(o);
    const straight = createRun(composed, { runtimes, checkpointEvery: 0.125 });
    straight.runUntil(1);
    assert.deepEqual(straight.diagnostics.filter((d) => d.severity === "error"), []);
    const want = straight.hashes.map((h) => `${h.T} ${h.hash}`);
    const seen = straight.state("scr").seen;
    assert.ok(seen > 0, "the consumer saw the producer's ops");
    for (const t of [0, 0.125, 0.2, 0.25, 0.375, 0.5]) {
      const run = createRun(composed, { runtimes, checkpointEvery: 0.125 });
      run.runUntil(1);
      run.rewind(t);
      run.runUntil(1);
      assert.deepEqual(run.hashes.map((h) => `${h.T} ${h.hash}`), want, `rewound to ${t}`);
      assert.deepEqual(pageView(run, composed, runtimes).list, pageView(straight, composed, runtimes).list);
    }
  });
}

test("a replay of the JSON round-tripped record matches (N005 never fires)", () => {
  const { composed, runtimes } = bench();
  const run = createRun(composed, { runtimes });
  run.runUntil(1);
  const r = replay(composed, { runtimes }, JSON.parse(JSON.stringify(run.record())));
  assert.deepEqual(r.diagnostics, []);
  assert.equal(r.ok, true);
});

test("a part rewound to a state whose lists it has not kept rebuilds them from that state", () => {
  const { composed, runtimes } = bench();
  const straight = createRun(composed, { runtimes, checkpointEvery: 0.125 });
  straight.runUntil(1);
  const run = createRun(composed, { runtimes, checkpointEvery: 0.125 });
  run.runUntil(1);
  // a checkpoint read back from storage holds equal states, not the same objects
  for (const cp of /** @type {any[]} */ (run.checkpoints)) for (const p of cp.parts) p.state = JSON.parse(JSON.stringify(p.state));
  run.rewind(0.25);
  assert.equal(pageView(run, composed, runtimes, "level").list.length, pageView(createRun(composed, { runtimes }).runUntil(0.25), composed, runtimes, "level").list.length);
  run.runUntil(1);
  assert.deepEqual(run.hashes.map((h) => h.hash), straight.hashes.map((h) => h.hash));
});

test("two parts that commit one state object keep their own lists (review F1)", () => {
  const sg = screen();
  const SHARED = Object.freeze({ t: 0 });
  const runtimes = [defineRuntime(sg, { clock: () => ({ tick: 1 / 8 }), init: () => SHARED, step: () => SHARED })];
  const a = /** @type {any} */ (sg("a")).size({ width: 40, height: 32 });
  const b = /** @type {any} */ (sg("b")).size({ width: 40, height: 64 });
  const composed = compose("shared-state").part(a).part(b).show(a).build();
  const run = createRun(composed, { runtimes });
  run.runUntil(0.25);
  assert.deepEqual(pageView(run, composed, runtimes, "a").list.map((op) => op.at), [[0, 24]]);
  assert.deepEqual(pageView(run, composed, runtimes, "b").list.map((op) => op.at), [[0, 56]]);
});

test("a delayed wire reads the lists as its instant began, even from a step that returns the state it was handed (review F1, suspected)", () => {
  const mg = drawnMaze();
  const ag = screen();
  const bg = screen((d) => { d.name = "shownscreen"; d.ports.in.board.seam = "Draw<80>@px"; d.ports.out.view.seam = "Draw<81>@px"; d.state.seen = "str"; });
  const runtimes = [
    defineRuntime(mg, {
      clock: () => ({ tick: 1 / 8 }),
      init: (/** @type {any} */ r) => ({ t: 0, score: 0, player: { x: 1, y: 1 }, home: [1, 1], grid: r.grid, coins: coinsOf(r.grid) }),
      step: (/** @type {any} */ s, /** @type {any} */ ctx) => { const n = mazeStep(s, ctx); return { ...n, coins: coinsOf(n.grid) }; },
      events: { out: { picked: 8 } },
    }),
    // the same state object every step: only its inputs (the score) change its picture
    defineRuntime(ag, { clock: () => ({ tick: 1 / 8 }), init: () => ({ t: 0 }), step: (/** @type {any} */ s) => s }),
    defineRuntime(bg, {
      clock: () => ({ tick: 1 / 8 }),
      init: () => ({ t: 0, seen: "" }),
      step: (/** @type {any} */ s, /** @type {any} */ ctx) => ({ t: s.t + ctx.dt, seen: ctx.inputs.board.map((/** @type {any} */ o) => o.str).join("") }),
    }),
  ];
  const level = /** @type {any} */ (mg("level")).grid(GRID).control(right);
  const hud = /** @type {any} */ (ag("hud")).size({ width: 40, height: 32 });
  const shown = /** @type {any} */ (bg("shown")).size({ width: 40, height: 32 });
  const composed = compose("delayed-same-state").part(level).part(hud).part(shown)
    .frame(hud.frame.px, shown.frame.px, { scale: 1, offset: 0 })
    .wire(level.out.score, hud.in.score)
    .wire(hud.out.view, shown.in.board, { delay: true }).show(shown).build();
  const run = createRun(composed, { runtimes });
  // each instant, the shown part's state is what hud's list said as the instant began: the instant before's
  /** @type {string[]} */
  const hudSaid = [pageView(run, composed, runtimes, "hud").list[0].str], shownSaw = [run.state("shown").seen];
  for (const t of [0, 0.125, 0.25, 0.375]) {
    run.runUntil(t);
    hudSaid.push(pageView(run, composed, runtimes, "hud").list[0].str);
    shownSaw.push(run.state("shown").seen);
  }
  assert.deepEqual(run.diagnostics.filter((d) => d.severity === "error"), []);
  assert.ok(hudSaid.includes("SCORE 0") && hudSaid.includes("SCORE 1"), hudSaid.join());
  assert.deepEqual(shownSaw.slice(1), hudSaid.slice(0, -1));
});
