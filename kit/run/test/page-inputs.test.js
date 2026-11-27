// A page input's edges: every press and release reaches each consumer wired to the control, in order, each at its own
// stamp (Ben, 2026-11-26, reversing ada0afe's latest-value coalescing); kit/compose sizes a page wire for a press and
// a release per control per frame, and past that the wire's overflow policy, or N002, says what happened; copied and
// checked when logged; routed only when the composition has the built-in page part.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRun, replay } from "../index.js";
import { compose, page, pageRuntime, PAGE_CONTROLS, PAGE_CHANGES_PER_FRAME } from "../../compose/index.js";
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

/** @param {any} W @param {Record<string, unknown>} [o]  the wire's options */
function wired(W, o) {
  const w = /** @type {any} */ (W.grammar("hero"));
  return compose("walk").part(w).wire(page.out.pad, w.in.pad, o).build({ runtimes: [W.runtime] });
}

/** The smallest max compose accepts on a reliable page wire into a consumer on this clock. @param {any} clock */
function smallest(clock) {
  for (let m = 1; m < 10000; m++) {
    const W = walker(clock, m), w = /** @type {any} */ (W.grammar("hero"));
    if (!compose("walk").part(w).wire(page.out.pad, w.in.pad).check({ runtimes: [W.runtime] }).length) return m;
  }
  throw new Error("no max fits");
}

test("a press and a release within one consumer step both arrive, in order, each at its own stamp", () => {
  const W = walker({ tick: 1 / 4 }, smallest({ tick: 1 / 4 }));
  const composed = wired(W);
  const run = createRun(composed, { runtimes: [W.runtime], inputs: [press(0.1, true), press(0.11, false)] });
  run.runUntil(1);
  assert.deepEqual(run.diagnostics, []);
  assert.deepEqual(run.state("hero").rights, [1, 0], "the press, then the release");
  assert.deepEqual(run.state("hero").seen, [0.1, 0.11]);
  assert.equal(replay(composed, { runtimes: [W.runtime] }, JSON.parse(JSON.stringify(run.record()))).ok, true);
});

test("a button tap at one stamp reaches the consumer as both records, in the order given", () => {
  const W = tiny("btn", { state: { got: list("f64", 100) }, inputs: false, ports: { in: { fire: { seam: "Event<{ held: bool }>", note: "the button" } } } },
    { clock: () => ({ tick: 1 / 4 }), init: () => ({ got: [] }), events: { in: { fire: 120 } },
      step: (/** @type {any} */ s, /** @type {any} */ c) => ({ got: [...s.got, ...c.inputs.fire.map((/** @type {any} */ r) => (r.held ? 1 : 0))] }) });
  const b = /** @type {any} */ (W.grammar("hero"));
  const composed = compose("tap").part(b).wire(page.out.a, b.in.fire).build({ runtimes: [W.runtime] });
  const tap = (/** @type {boolean} */ held) => ({ kind: "control", T: 0.3, part: "page", name: "a", value: { held } });
  const run = createRun(composed, { runtimes: [W.runtime], inputs: [tap(true), tap(false)] });
  run.runUntil(1);
  assert.deepEqual(run.diagnostics, []);
  assert.deepEqual(run.state("hero").got, [1, 0]);
});

test("two pad changes inside one display frame both reach a frame consumer that takes the page's bound", () => {
  const W = walker({ frame: true }, PAGE_CHANGES_PER_FRAME);
  const composed = wired(W);
  const inputs = [{ kind: "frame", T: "1/60" }, { kind: "frame", T: "2/60" }, { kind: "frame", T: "3/60" }, press("61/3600", true), press("62/3600", false)];
  const run = createRun(composed, { runtimes: [W.runtime], frames: "display", inputs });
  run.runUntil(0.05);
  assert.deepEqual(run.diagnostics, []);
  assert.deepEqual(run.state("hero").rights, [1, 0]);
  assert.deepEqual(run.state("hero").seen, [61 / 3600, 62 / 3600]);
  assert.equal(replay(composed, { runtimes: [W.runtime] }, JSON.parse(JSON.stringify(run.record()))).ok, true);
});

test("compose sizes a page wire for a press and a release per control per frame", () => {
  assert.equal(PAGE_CHANGES_PER_FRAME, 2);
  for (const c of Object.keys(PAGE_CONTROLS)) assert.equal(pageRuntime.events.out[c], PAGE_CHANGES_PER_FRAME, c);
  const W = walker({ frame: true }, 1), h = /** @type {any} */ (W.grammar("hero"));
  assert.deepEqual(compose("walk").part(h).wire(page.out.pad, h.in.pad).check({ runtimes: [W.runtime] }).map((d) => d.code), ["S116"], "a frame consumer taking one");
  assert.equal(smallest({ frame: true }), 2);
  assert.equal(smallest({ tick: 1 / 4 }), 120, "60 frames of at most 1/240 s in a quarter second, two changes each");
});

test("a burst of page inputs between two steps of the smallest consumer compose accepts arrives whole, in order", () => {
  const W = walker({ tick: 1 / 4 }, smallest({ tick: 1 / 4 }));
  const composed = wired(W);
  const inputs = Array.from({ length: 69 }, (_, i) => press(0.01 + i * 0.001, i % 2 === 0));
  const run = createRun(composed, { runtimes: [W.runtime], inputs });
  run.runUntil(1);
  assert.deepEqual(run.diagnostics, []);
  assert.equal(run.state("hero").x, 69);
  assert.deepEqual(run.state("hero").rights, inputs.map((e) => (e.value.right ? 1 : 0)));
  assert.equal(replay(composed, { runtimes: [W.runtime] }, JSON.parse(JSON.stringify(run.record()))).ok, true);
});

test("past the bound, a page wire's overflow policy trims what a step takes, counted and noted, never silently", () => {
  const W = walker({ frame: true }, PAGE_CHANGES_PER_FRAME);
  const composed = wired(W, { overflow: "keepLast" });
  const inputs = [{ kind: "frame", T: "1/60" }, { kind: "frame", T: "2/60" }, press("61/3600", true), press("62/3600", false), press("63/3600", true)];
  const run = createRun(composed, { runtimes: [W.runtime], frames: "display", inputs });
  run.runUntil(2 / 60);
  assert.deepEqual(run.state("hero").rights, [0, 1], "the newest two");
  assert.deepEqual(run.stats().overflow, { "page.out.pad → hero.in.pad": 1 });
  assert.deepEqual(run.diagnostics.map((d) => [d.code, d.severity]), [["N001", "warning"]]);
});

test("past the bound on a page wire with no policy, the consumer's step is refused (N002) and the records are counted", () => {
  const W = walker({ frame: true }, PAGE_CHANGES_PER_FRAME);
  const composed = wired(W);
  const inputs = [{ kind: "frame", T: "1/60" }, { kind: "frame", T: "2/60" }, press("61/3600", true), press("62/3600", false), press("63/3600", true)];
  const run = createRun(composed, { runtimes: [W.runtime], frames: "display", inputs });
  run.runUntil(2 / 60);
  assert.deepEqual(run.state("hero").rights, [], "none were taken");
  assert.deepEqual(run.diagnostics.map((d) => d.code), ["N002", "N001"]);
  assert.deepEqual(run.stats().stopped, { "page.out.pad → hero.in.pad": 3 });
});

test("changes in separate instants each arrive, and the same run chunked live is the same as scripted", () => {
  const W = walker({ tick: 1 / 4 }, smallest({ tick: 1 / 4 }));
  const composed = wired(W);
  const scripted = createRun(composed, { runtimes: [W.runtime], inputs: [press(0.1), press(0.2, false), press(0.3), press(0.6, false)] });
  scripted.runUntil(1);
  assert.deepEqual(scripted.state("hero").rights, [1, 0, 1, 0]);
  const live = createRun(composed, { runtimes: [W.runtime] });
  live.runUntil(0.15);
  live.input(press(0.1));
  live.runUntil(0.22);
  live.input(press(0.23, false));
  live.runUntil(1);
  assert.deepEqual(live.state("hero").rights, [1, 0], "applied between instants, the pair lands in one step, both records");
  const again = createRun(composed, { runtimes: [W.runtime], inputs: live.log.inputs });
  again.runUntil(1);
  assert.deepEqual(again.hashes, live.hashes);
});

test("a run with taps between steps replays and rewinds to the straight run's records and hashes", () => {
  const W = walker({ tick: 1 / 4 }, smallest({ tick: 1 / 4 }));
  const composed = wired(W);
  const taps = [0.1, 0.6, 1.3, 1.34, 2.05, 2.7].flatMap((t, i) => [{ ...press(0, true), T: t + i * 0.001 }, { ...press(0, false), T: t + i * 0.001 + 0.02 }]);
  const straight = createRun(composed, { runtimes: [W.runtime], inputs: taps, checkpointEvery: 0.5 });
  straight.runUntil(3);
  assert.equal(straight.state("hero").x, taps.length);
  const chunked = createRun(composed, { runtimes: [W.runtime], inputs: taps, checkpointEvery: 0.5 });
  for (const t of [0.4, 1.32, 2.2, 3]) chunked.runUntil(t);
  assert.deepEqual(chunked.hashes, straight.hashes);
  for (const back of [2.1, 1.31, 0.05]) {
    chunked.rewind(back);
    assert.deepEqual(chunked.log.inputs.filter((e) => e.part === "page").length, taps.filter((e) => e.T <= back).length, "a rewind is a branch: later inputs are dropped");
    for (const e of taps) if (e.T > back) chunked.input(e);
    chunked.runUntil(3);
    assert.deepEqual(chunked.hashes, straight.hashes);
    assert.deepEqual(chunked.state("hero").rights, straight.state("hero").rights);
    assert.deepEqual(chunked.state("hero").seen, straight.state("hero").seen);
  }
  const r = replay(composed, { runtimes: [W.runtime] }, JSON.parse(JSON.stringify(straight.record())));
  assert.equal(r.ok, true, r.ok ? "" : r.diagnostics.map((/** @type {any} */ d) => d.message).join("\n"));
  assert.deepEqual(straight.log.inputs.filter((e) => e.part === "page").map((e) => e.value), taps.map((e) => e.value), "the log keeps every input as given");
});

test("a page input is copied when logged: a later host mutation changes nothing, and the log holds a copy", () => {
  const W = walker({ tick: 1 / 4 }, smallest({ tick: 1 / 4 }));
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
  const W = walker({ tick: 1 / 4 }, smallest({ tick: 1 / 4 }));
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
