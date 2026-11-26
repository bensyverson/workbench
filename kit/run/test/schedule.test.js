// kit/run's scheduler: one workbench time with rational tick instants, wire order within an instant, Events
// delivered exactly once and in order, conversions and renames applied as values cross, delayed wires, and demand
// parts woken by what they read (the clocks draft, as ruled 2026-11-26).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRun } from "../index.js";
import { compose } from "../../compose/index.js";
import { bursts, rightAt, mazeKit, fxKit, tiny } from "./helpers.js";

test("1/8 and 1/30 meet exactly at 1/2, and the producer steps first", () => {
  const { composed, runtimes } = bursts();
  const run = createRun(composed, { runtimes });
  /** @type {Array<{ T: string, stepped: string[] }>} */
  const seen = [];
  for (;;) {
    const i = /** @type {any} */ (run.step());
    if (run.seconds > 0.5) break;
    seen.push(i);
  }
  assert.deepEqual(seen[0], { T: "0", stepped: ["level", "fx"] });
  assert.deepEqual(seen.at(-1), { T: "1/2", stepped: ["level", "fx"] });
  // instants up to 1/2: 5 of level's, 16 of fx's, two shared (0 and 1/2)
  assert.equal(seen.length, 19);
  assert.equal(seen.filter((i) => i.stepped.length === 2).length, 2);
  // ties go by part order only when no wire orders them: here the wire puts level first even if fx is added first
  const { composed: c2, runtimes: r2 } = bursts();
  const swapped = { ...c2, parts: [...c2.parts].reverse() };
  assert.deepEqual(/** @type {any} */ (createRun(swapped, { runtimes: r2 }).step()).stepped, ["level", "fx"]);
});

test("a pickup at T = 19/8 bursts at fx's first step at or after it, T = 2.4, once, converted into px", () => {
  const { composed, runtimes } = bursts();
  const run = createRun(composed, { runtimes, inputs: [rightAt(18 / 8)] });
  run.runUntil(3);
  const seen = run.state("fx").seen;
  // the corridor's second coin is picked at 20/8 = 2.5, where both parts step: same instant, producer first
  assert.deepEqual(seen.map((/** @type {any} */ s) => [s.T, s.x, s.y]), [[2.4, 35, 15], [2.5, 45, 15]]);
  assert.equal(run.state("level").score, 2);
});

test("a slow consumer takes several producer steps' records together, each once, in order", () => {
  const { composed, runtimes } = bursts({ fx: fxKit({ clock: { tick: 1 / 4 }, max: 16 }) });
  const run = createRun(composed, { runtimes, inputs: [rightAt(0)] });
  run.runUntil(1);
  // level picks at 1/8 (x = 3) and 2/8 (x = 4); fx steps at 0, 1/4, 1/2 …: both at 1/4, in pick order
  assert.deepEqual(run.state("fx").seen.map((/** @type {any} */ s) => [s.T, s.x]), [[0.25, 35], [0.25, 45]]);
});

test("a delayed wire reads the previous instant: a burst lands at the consumer's first step after the pickup", () => {
  const { composed, runtimes } = bursts({ wire: { delay: true } });
  const run = createRun(composed, { runtimes, inputs: [rightAt(18 / 8)] });
  run.runUntil(3);
  // 2.375 → 2.4 as before; the pickup at 2.5 now lands at 2.5 + 1/30
  assert.deepEqual(run.state("fx").seen.map((/** @type {any} */ s) => s.T), [2.4, 38 / 15]);
});

test("a demand consumer steps at the first instant, then only when an Event arrives, at the pickup's instant", () => {
  const { composed, runtimes } = bursts({ fx: fxKit({ clock: { demand: true } }) });
  const run = createRun(composed, { runtimes, inputs: [rightAt(18 / 8)] });
  /** @type {string[]} */
  const fxAt = [];
  while (run.seconds < 3) { const i = /** @type {any} */ (run.step()); if (i.stepped.includes("fx")) fxAt.push(i.T); }
  assert.deepEqual(fxAt, ["0", "19/8", "5/2"]);
  assert.deepEqual(run.state("fx").seen.map((/** @type {any} */ s) => s.T), [2.375, 2.5]);
  assert.equal(run.state("fx").t, 0, "a demand part's dt is 0");
});

test("a value input reads the producer's latest snapshot, converted; a demand part wakes when it changes", () => {
  const prod = tiny("prod", { state: { x: "f64" }, frames: { cell: { dims: 2, note: "cells" } }, ports: { out: { pos: { seam: "point2@cell", from: (/** @type {any} */ s) => [s.x, 0] }, len: { seam: "f64@cell", from: "x" } } } },
    { clock: () => ({ tick: 1 / 4 }), init: () => ({ x: 0 }), step: (/** @type {any} */ _s, /** @type {any} */ c) => ({ x: c.T >= 0.5 ? 1 : 0 }) });
  const cons = tiny("cons", { state: { got: "v2", len: "f64", steps: "f64" }, ports: { in: { at: { seam: "point2@px", default: [0, 0] }, len: { seam: "f64@px", default: 0 } } } },
    { clock: () => ({ demand: true }), init: () => ({ got: [0, 0], len: 0, steps: 0 }), step: (/** @type {any} */ s, /** @type {any} */ c) => ({ got: c.inputs.at, len: c.inputs.len, steps: s.steps + 1 }) });
  const a = /** @type {any} */ (prod.grammar("a")), b = /** @type {any} */ (cons.grammar("b"));
  const composed = compose("v").part(a).part(b).frame(a.frame.cell, b.frame.px, { scale: -2, offset: 7 }).wire(a.out.pos, b.in.at).wire(a.out.len, b.in.len).build();
  const run = createRun(composed, { runtimes: [prod.runtime, cons.runtime] });
  run.runUntil(1);
  // steps at 0 (first instant) and 1/2 (x became 1): a point by scale and offset, a quantity by the scale's magnitude
  assert.deepEqual(run.state("b"), { got: [5, 7], len: 2, steps: 2 });
});

test("a rename crosses before the conversions: with a swap, the field that is a point after the rename converts", () => {
  const prod = tiny("prod", { state: { t: "f64" }, frames: { cell: { dims: 2, note: "cells" } }, inputs: false, ports: { out: { e: { seam: "Event<{ pos: point2@cell, dir: vec2@cell }>" } } } },
    { clock: () => ({ tick: 1 }), init: () => ({ t: 0 }), step: (/** @type {any} */ s, /** @type {any} */ c) => { c.events.e.push({ pos: [1, 1], dir: [2, 3] }); return s; }, events: { out: { e: 1 } } });
  const cons = tiny("cons", { state: { got: "v2", g2: "v2" }, inputs: false, ports: { in: { e: { seam: "Event<{ dir: point2@px, pos: vec2@px }>" } } } },
    { clock: () => ({ tick: 1 }), init: () => ({ got: [0, 0], g2: [0, 0] }), step: (/** @type {any} */ s, /** @type {any} */ c) => (c.inputs.e.length ? { got: c.inputs.e[0].dir, g2: c.inputs.e[0].pos } : s), events: { in: { e: 1 } } });
  const a = /** @type {any} */ (prod.grammar("a")), b = /** @type {any} */ (cons.grammar("b"));
  const composed = compose("r").part(a).part(b).frame(a.frame.cell, b.frame.px, { scale: 10, offset: 5 }).wire(a.out.e, b.in.e, { rename: { pos: "dir", dir: "pos" } }).build();
  const run = createRun(composed, { runtimes: [prod.runtime, cons.runtime] });
  run.step();
  // pos [1, 1] became dir, a point: ×10 +5; dir [2, 3] became pos, a vector: ×10, no offset
  assert.deepEqual(run.state("b"), { got: [15, 15], g2: [20, 30] });
});

test("a step gets the Program's Kernels, its own seeded rng, dt, T, and its controls; init gets the record", () => {
  /** @type {any[]} */
  const calls = [];
  const M = mazeKit({ step: (/** @type {any} */ s, /** @type {any} */ c) => { calls.push({ T: c.T, dt: c.dt, r: c.rng(), kernels: Object.keys(c.kernels), pad: c.controls.pad ?? null }); return s; } });
  const { composed, runtimes } = bursts({ maze: M });
  const run = createRun(composed, { runtimes, seed: 7, inputs: [rightAt(1 / 8)], dev: false });
  run.runUntil(1 / 8);
  assert.deepEqual(calls.map((c) => [c.T, c.dt, c.kernels, c.pad?.right ?? null]), [[0, 0.125, ["level.control"], null], [0.125, 0.125, ["level.control"], true]]);
  assert.ok(calls.every((c) => c.r >= 0 && c.r < 1));
  /** @type {number[]} */
  const again = [];
  const M2 = mazeKit({ step: (/** @type {any} */ s, /** @type {any} */ c) => { again.push(c.rng()); return s; } });
  const b2 = bursts({ maze: M2 });
  createRun(b2.composed, { runtimes: b2.runtimes, seed: 7, dev: false }).runUntil(1 / 8);
  assert.deepEqual(again, calls.map((c) => c.r), "the same seed gives the same stream");
});

test("ctx.kernels.<slot> is the part's own lambda: kernels.control is kernels[`${part}.control`]; full ids still work", () => {
  /** @type {any[]} */
  const seen = [];
  const M = mazeKit({ step: (/** @type {any} */ s, /** @type {any} */ c) => {
    seen.push([typeof c.kernels.control, c.kernels.control === c.kernels[`${c.part}.control`], c.kernels.spawn]);
    const pl = { x: 0, y: 0, dx: 0, dy: 0 };
    c.kernels.control(pl, { up: false, down: false, left: false, right: true });
    return { ...s, t: s.t + c.dt, player: { x: s.player.x + pl.dx, y: s.player.y } };
  } });
  /** @type {any[]} */
  const fxSeen = [];
  const F = fxKit({ step: (/** @type {any} */ s, /** @type {any} */ c) => { fxSeen.push([typeof c.kernels["pop.spawn"], c.kernels.spawn]); return s; } });
  const { composed, runtimes } = bursts({ maze: M, fx: F });
  const run = createRun(composed, { runtimes, dev: false });
  run.runUntil(1 / 8);
  assert.deepEqual(seen[0], ["function", true, undefined]);
  assert.equal(run.state("level").player.x, 3);
  // an emitter's lambda is a child instance's, not the part's: only its full id names it
  assert.deepEqual(fxSeen[0], ["function", undefined]);
});

test("a nested field the consumer does not take never reaches it (kit/seam lists it by path)", () => {
  const prod = tiny("prod", { state: { t: "f64" }, inputs: false, ports: { out: { e: { seam: "Event<{ inner: { a: f64, x: f64 }, keep: f64 }>" } } } },
    { clock: () => ({ tick: 1 }), init: () => ({ t: 0 }), step: (/** @type {any} */ s, /** @type {any} */ c) => { c.events.e.push({ inner: { a: 1, x: 2 }, keep: 3 }); return s; }, events: { out: { e: 1 } } });
  const cons = tiny("cons", { state: { got: "str" }, inputs: false, ports: { in: { e: { seam: "Event<{ inner: { a: f64 } }>" } } } },
    { clock: () => ({ tick: 1 }), init: () => ({ got: "" }), step: (/** @type {any} */ s, /** @type {any} */ c) => (c.inputs.e.length ? { got: JSON.stringify(c.inputs.e[0]) } : s), events: { in: { e: 1 } } });
  const a = /** @type {any} */ (prod.grammar("a")), b = /** @type {any} */ (cons.grammar("b"));
  const composed = compose("n").part(a).part(b).wire(a.out.e, b.in.e).build();
  assert.deepEqual(composed.wires[0].dropped, ["keep", "inner.x"]);
  const run = createRun(composed, { runtimes: [prod.runtime, cons.runtime] });
  run.step();
  assert.equal(run.state("b").got, '{"inner":{"a":1}}');
});
