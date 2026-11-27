// $T on every Event record a consumer sees (ruling 3, 2026-11-26): the same in dev and non-dev runs, on records the
// producer or the host froze or reused, and in a replay of a JSON round-tripped log. The run copies, stamps, freezes:
// it never touches an object it was handed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRun, replay } from "../index.js";
import { compose, page } from "../../compose/index.js";
import { list, struct } from "../../define/index.js";
import { tiny, pair, controlsOf, FOUR } from "./helpers.js";

const EXPECT = [0, 0.25, 0.5, 0.75, 1];
const seeing = (/** @type {any} */ s, /** @type {any} */ c) => ({ got: [...s.got, ...c.inputs.e.map((/** @type {any} */ r) => r.$T ?? -1)], Ts: s.Ts, biggest: 0 });
const clocks = { prodClock: { tick: 1 / 4 }, consClock: { tick: 1 / 4 } };

/** @param {Function} prodStep */
function seen(prodStep) {
  const { composed, runtimes } = pair({ ...clocks, prodStep, consStep: seeing });
  const run = createRun(composed, { runtimes });
  run.runUntil(1);
  return { run, composed, runtimes, got: run.state("b").got };
}

test("a producer that keeps the record it pushes in its state: $T arrives in dev and non-dev runs alike", () => {
  const prod = tiny("prod", { state: { n: "f64", last: struct({ n: "f64" }) }, inputs: false, ports: { out: { e: { seam: "Event<{ n: f64 }>" } } } },
    { clock: () => ({ tick: 1 / 4 }), init: () => ({ n: 0, last: { n: -1 } }), events: { out: { e: 1 } },
      step: (/** @type {any} */ s, /** @type {any} */ c) => { const rec = { n: s.n }; c.events.e.push(rec); return { n: s.n + 1, last: rec }; } });
  const cons = tiny("cons", { state: { Ts: list("f64", 1000) }, inputs: false, ports: { in: { e: { seam: "Event<{ n: f64 }>" } } } },
    { clock: () => ({ tick: 1 / 4 }), init: () => ({ Ts: [] }), step: (/** @type {any} */ s, /** @type {any} */ c) => ({ Ts:[...s.Ts, ...c.inputs.e.map((/** @type {any} */ r) => r.$T ?? -1)] }), events: { in: { e: 8 } } });
  const runtimes = [prod.runtime, cons.runtime];
  const a = /** @type {any} */ (prod.grammar("a")), b = /** @type {any} */ (cons.grammar("b"));
  const composed = compose("c").part(a).part(b).wire(a.out.e, b.in.e).build({ runtimes });
  for (const dev of [false, true]) {
    const run = createRun(composed, { runtimes, dev });
    run.runUntil(1);
    assert.deepEqual(run.state("b").Ts, EXPECT, `dev ${dev}`);
  }
});

test("a record the producer froze still gets $T, and the producer's object is untouched", () => {
  const REC = Object.freeze({ n: 7 });
  const { got } = seen((/** @type {any} */ s, /** @type {any} */ c) => { c.events.e.push(REC); return { n: s.n + 1 }; });
  assert.deepEqual(got, EXPECT);
  assert.equal(Object.hasOwn(REC, "$T"), false);
});

test("one object pushed at every step is stamped with each instant, and is never frozen or stamped itself", () => {
  const shared = { n: 1 };
  const { got } = seen((/** @type {any} */ s, /** @type {any} */ c) => { c.events.e.push(shared); return { n: s.n + 1 }; });
  assert.deepEqual(got, EXPECT);
  assert.equal(Object.isFrozen(shared), false);
  assert.equal(Object.hasOwn(shared, "$T"), false);
});

test("a delivered record is frozen, read-only in $T, and not enumerable", () => {
  /** @type {any[]} */
  const kept = [];
  const { composed, runtimes } = pair({ ...clocks, consStep: (/** @type {any} */ s, /** @type {any} */ c) => { kept.push(...c.inputs.e); return seeing(s, c); } });
  createRun(composed, { runtimes }).runUntil(0.5);
  assert.ok(kept.length > 0);
  for (const r of kept) { assert.equal(Object.isFrozen(r), true); assert.deepEqual(Object.keys(r), ["n"]); assert.equal(typeof r.$T, "number"); }
});

/** A walker fed by the page, through its own declared pad (declared Controls, 2026-11-27). */
function walker() {
  return tiny("walk", { state: { x: "f64", seen: list("f64", 1000) }, inputs: false, ports: { in: { pad: { seam: "Event<{ up: bool, down: bool, left: bool, right: bool }>", note: "the pad" } } } },
    { clock: () => ({ tick: 1 / 4 }), init: () => ({ x: 0, seen: [] }), events: { in: { pad: 120 } },
      step: (/** @type {any} */ s, /** @type {any} */ c) => ({ x: s.x, seen: [...s.seen, ...c.inputs.pad.map((/** @type {any} */ r) => r.$T ?? -1)] }) });
}

test("the host's own pad object is never frozen or stamped, so it can be reused; $T is each input's stamp", () => {
  const W = walker();
  const w = /** @type {any} */ (W.grammar("hero"));
  const composed = compose("walk").part(w).wire(page.out.pad, w.in.pad).build({ runtimes: [W.runtime], packages: controlsOf(W, { pad: FOUR }) });
  const pad = { up: false, down: false, left: false, right: true };
  const run = createRun(composed, { runtimes: [W.runtime] });
  run.input({ kind: "control", T: 0.1, part: "page", name: "pad", value: pad });
  run.runUntil(0.5);
  assert.equal(Object.isFrozen(pad), false);
  pad.right = false;
  run.input({ kind: "control", T: 0.6, part: "page", name: "pad", value: pad });
  run.runUntil(1);
  assert.deepEqual(run.state("hero").seen, [0.1, 0.6]);
  assert.equal(Object.hasOwn(pad, "$T"), false);
});

test("a frozen host object gets $T too, and a JSON round-tripped log replays", () => {
  const W = walker();
  const w = /** @type {any} */ (W.grammar("hero"));
  const composed = compose("walk").part(w).wire(page.out.pad, w.in.pad).build({ runtimes: [W.runtime], packages: controlsOf(W, { pad: FOUR }) });
  const pad = Object.freeze({ up: false, down: false, left: false, right: true });
  const run = createRun(composed, { runtimes: [W.runtime] });
  run.input({ kind: "control", T: 0.1, part: "page", name: "pad", value: pad });
  run.runUntil(0.5);
  run.input({ kind: "control", T: 0.6, part: "page", name: "pad", value: pad });
  run.runUntil(1);
  assert.deepEqual(run.state("hero").seen, [0.1, 0.6]);
  const saved = JSON.parse(JSON.stringify(run.record()));
  const r = replay(composed, { runtimes: [W.runtime] }, saved);
  assert.equal(r.ok, true, r.ok ? "" : r.diagnostics.map((/** @type {any} */ d) => d.message).join("\n"));
});

test("a producer that reuses one object replays from a JSON round-tripped log, in the same process", () => {
  const shared = { n: 1 };
  const { run, composed, runtimes } = seen((/** @type {any} */ s, /** @type {any} */ c) => { c.events.e.push(shared); return { n: s.n + 1 }; });
  const r = replay(composed, { runtimes }, JSON.parse(JSON.stringify(run.record())));
  assert.equal(r.ok, true);
});
