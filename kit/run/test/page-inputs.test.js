// A page input's edges (review of 5e0813e): coalesced to the latest value per control per instant so a page wire never
// delivers more than kit/compose's one record per control per frame; copied and checked when logged; routed only when
// the composition has the built-in page part.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRun, replay } from "../index.js";
import { compose, page } from "../../compose/index.js";
import { list } from "../../define/index.js";
import { tiny } from "./helpers.js";

/** @param {any} clock @param {number} max */
function walker(clock, max) {
  return tiny("walk", { state: { x: "f64", seen: list("f64", 1000), rights: list("f64", 1000) }, inputs: false, ports: { in: { pad: { seam: "Event<{ right: bool }>", note: "the pad" } } } },
    { clock: () => clock, init: () => ({ x: 0, seen: [], rights: [] }), events: { in: { pad: max } },
      step: (/** @type {any} */ s, /** @type {any} */ c) => ({ x: s.x + c.inputs.pad.length, seen: [...s.seen, ...c.inputs.pad.map((/** @type {any} */ r) => r.$T)], rights: [...s.rights, ...c.inputs.pad.map((/** @type {any} */ r) => (r.right ? 1 : 0))] }) });
}
const PAD = (/** @type {boolean} */ right) => ({ up: false, down: false, left: false, right });
const press = (/** @type {number | string} */ T, right = true) => ({ kind: "control", T, part: "page", name: "pad", value: PAD(right) });

/** @param {any} W */
function wired(W) {
  const w = /** @type {any} */ (W.grammar("hero"));
  return compose("walk").part(w).wire(page.out.pad, w.in.pad).build({ runtimes: [W.runtime] });
}

test("two pad changes inside one display frame deliver one record, the latest, to a frame consumer that takes one", () => {
  const W = walker({ frame: true }, 1);
  const composed = wired(W);
  const inputs = [{ kind: "frame", T: "1/60" }, { kind: "frame", T: "2/60" }, { kind: "frame", T: "3/60" }, press("61/3600", true), press("62/3600", false)];
  const run = createRun(composed, { runtimes: [W.runtime], frames: "display", inputs });
  run.runUntil(0.05);
  assert.deepEqual(run.diagnostics, []);
  assert.equal(run.state("hero").x, 1, "one record");
  assert.deepEqual(run.state("hero").rights, [0], "the later one");
  assert.deepEqual(run.state("hero").seen, [62 / 3600]);
  assert.equal(run.log.inputs.filter((e) => e.part === "page").length, 2, "the log holds both inputs as given; the coalescing is a function of the log");
  assert.equal(replay(composed, { runtimes: [W.runtime] }, JSON.parse(JSON.stringify(run.record()))).ok, true);
});

test("a burst of page inputs between two steps of the smallest consumer compose accepts delivers one record", () => {
  let max = 0;
  for (const m of [1, 2, 4, 8, 16, 32, 64]) {
    const W = walker({ tick: 1 / 4 }, m), w = /** @type {any} */ (W.grammar("hero"));
    if (!compose("walk").part(w).wire(page.out.pad, w.in.pad).check({ runtimes: [W.runtime] }).length) { max = m; break; }
  }
  assert.ok(max > 0);
  const W = walker({ tick: 1 / 4 }, max);
  const composed = wired(W);
  const inputs = Array.from({ length: 69 }, (_, i) => press(0.01 + i * 0.001, i % 2 === 0));
  const run = createRun(composed, { runtimes: [W.runtime], inputs });
  run.runUntil(1);
  assert.deepEqual(run.diagnostics, []);
  assert.equal(run.state("hero").x, 1);
  assert.deepEqual(run.state("hero").rights, [1], "the 69th change (index 68, even) is the one delivered");
  assert.equal(replay(composed, { runtimes: [W.runtime] }, JSON.parse(JSON.stringify(run.record()))).ok, true);
});

test("changes in separate instants each arrive, and the same run chunked live is the same as scripted", () => {
  const W = walker({ tick: 1 / 4 }, 64);
  const composed = wired(W);
  const scripted = createRun(composed, { runtimes: [W.runtime], inputs: [press(0.1), press(0.2, false), press(0.3), press(0.6, false)] });
  scripted.runUntil(1);
  assert.deepEqual(scripted.state("hero").rights, [0, 1, 0]);
  const live = createRun(composed, { runtimes: [W.runtime] });
  live.runUntil(0.15);
  live.input(press(0.1));
  live.runUntil(0.22);
  live.input(press(0.23, false));
  live.runUntil(1);
  assert.deepEqual(live.state("hero").rights, [0], "applied between instants, the pair still lands in one instant");
  const again = createRun(composed, { runtimes: [W.runtime], inputs: live.log.inputs });
  again.runUntil(1);
  assert.deepEqual(again.hashes, live.hashes);
});

test("a page input is copied when logged: a later host mutation changes nothing, and the log holds a copy", () => {
  const W = walker({ tick: 1 / 4 }, 64);
  const composed = wired(W);
  const run = createRun(composed, { runtimes: [W.runtime] });
  run.runUntil(0.25);
  const pad = PAD(true);
  run.input({ kind: "control", T: 0.3, part: "page", name: "pad", value: pad });
  pad.right = false;
  run.runUntil(1);
  assert.deepEqual(run.state("hero").rights, [1]);
  assert.deepEqual(run.log.inputs.find((e) => e.part === "page")?.value, PAD(true));
  assert.equal(replay(composed, { runtimes: [W.runtime] }, run.record()).ok, true);
});

test("a page input is checked when it is logged, by run.input too", () => {
  const W = walker({ tick: 1 / 4 }, 64);
  const run = createRun(wired(W), { runtimes: [W.runtime] });
  assert.throws(() => run.input({ kind: "control", T: 0.3, part: "page", name: "pad", value: { right: true } }), /pad/);
  assert.throws(() => run.input({ kind: "control", T: 0.3, part: "page", name: "knob", value: {} }), /no control 'knob'/);
});

/** A part named "page" that reads ctx.controls. */
function named() {
  return tiny("pg", { state: { right: "f64", lights: "f64" }, inputs: false, ports: { out: {}, in: {} } },
    { clock: () => ({ tick: 1 / 4 }), init: () => ({ right: 0, lights: 0 }), step: (/** @type {any} */ s, /** @type {any} */ c) => ({ right: c.controls.pad?.right ? 1 : s.right, lights: c.controls.lights ?? s.lights }) });
}

test("a user part named page, in a composition with no built-in page, keeps its own controls", () => {
  const P = named();
  const composed = compose("alone").part(P.grammar("page")).build({ runtimes: [P.runtime] });
  const run = createRun(composed, { runtimes: [P.runtime], inputs: [{ kind: "control", T: 0.1, part: "page", name: "pad", value: PAD(true) }, { kind: "control", T: 0.1, part: "page", name: "lights", value: 3 }] });
  run.runUntil(1);
  assert.equal(run.state("page").right, 1);
  assert.equal(run.state("page").lights, 3);
});

test("a page input to a composition with no page part throws, as an input naming an unknown part does", () => {
  const P = named();
  const composed = compose("alone").part(P.grammar("solo")).build({ runtimes: [P.runtime] });
  const bad = (/** @type {string} */ part) => () => createRun(composed, { runtimes: [P.runtime], inputs: [{ kind: "control", T: 0.1, part, name: "pad", value: PAD(true) }] }).runUntil(1);
  assert.throws(bad("nope"), /names no part 'nope'/);
  assert.throws(bad("page"), /names no part 'page'/);
});
