// The run's own checks: N002 (a state that does not fit, or more Events than declared), N003 (a step that changes
// the state it was handed, or keeps memory outside it), N004 (a step or init that throws), N006 (a clock that is not
// one), and a composition whose queues are not sized (S116) refused before any step.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRun, RunError, RUN_CODES } from "../index.js";
import { defineRuntime } from "../../define/index.js";
import { bursts, mazeKit, mazeStep, fxKit, rightAt } from "./helpers.js";

/** @param {any} run */
const codes = (run) => run.diagnostics.map((/** @type {any} */ d) => d.code);
/** Codes seen by the cases below. */
const seen = new Set();
/** @param {any} run */
const note = (run) => { runs.push(run); return run; };
/** The runs the cases made: their codes are read at the end. @type {any[]} */
const runs = [];

test("N002: a step that returns a state not fitting the Dialect's state stops that part; the others run on", () => {
  const M = mazeKit({ step: (/** @type {any} */ s, /** @type {any} */ c) => (c.T >= 0.25 ? { ...s, score: "lots" } : mazeStep(s, c)) });
  const { composed, runtimes } = bursts({ maze: M });
  const run = note(createRun(composed, { runtimes }));
  run.runUntil(1);
  assert.deepEqual(codes(run), ["N002"]);
  const d = run.diagnostics[0];
  assert.equal(d.part, "level");
  assert.equal(d.T, "1/4");
  assert.equal(d.revision, 1);
  assert.match(d.message, /score: expected f64/);
  assert.equal(run.snapshot("level").T, "1/8", "the last good snapshot is kept");
  assert.equal(run.state("fx").t > 0.9, true, "fx ran on");
});

test("N002: a step that pushes more records than its Event output's max", () => {
  const M = mazeKit({ max: 1, step: (/** @type {any} */ s, /** @type {any} */ c) => { c.events.picked.push({ at: [1, 1] }, { at: [1, 1] }); return s; } });
  const run = note(createRun(bursts({ maze: M, fx: fxKit({ max: 8 }) }).composed, { runtimes: [M.runtime, fxKit().runtime] }));
  run.step();
  assert.deepEqual(codes(run), ["N002"]);
  assert.match(run.diagnostics[0].message, /events\.picked: 2 records, and the runtime declares at most 1/);
});

test("N003: in a development run, a step that changes the state it was handed, or keeps memory outside it", () => {
  const M = mazeKit({ step: (/** @type {any} */ s) => { s.score += 1; return s; } });
  const run = note(createRun(bursts({ maze: M }).composed, { runtimes: [M.runtime, fxKit().runtime] }));
  run.step();
  assert.deepEqual(codes(run), ["N003"]);
  assert.match(run.diagnostics[0].message, /changed the state it was handed/);
  let calls = 0;
  const N = mazeKit({ step: (/** @type {any} */ s) => ({ ...s, score: ++calls }) });
  const r2 = note(createRun(bursts({ maze: N }).composed, { runtimes: [N.runtime, fxKit().runtime] }));
  r2.step();
  assert.deepEqual(codes(r2), ["N003"]);
  assert.match(r2.diagnostics[0].message, /kept memory outside its state/);
  // not a development run: neither is checked, so the second runs
  let c3 = 0;
  const P = mazeKit({ step: (/** @type {any} */ s) => ({ ...s, score: ++c3 }) });
  const r3 = createRun(bursts({ maze: P }).composed, { runtimes: [P.runtime, fxKit().runtime], dev: false });
  r3.runUntil(1 / 8);
  assert.deepEqual(codes(r3), []);
  assert.equal(r3.state("level").score, 2);
});

test("N004: a step or init that throws stops its part; the others run on with its last snapshot", () => {
  const M = mazeKit({ step: (/** @type {any} */ s, /** @type {any} */ c) => { if (c.T > 0.2) throw new Error("boom"); return mazeStep(s, c); } });
  const run = note(createRun(bursts({ maze: M }).composed, { runtimes: [M.runtime, fxKit().runtime], inputs: [rightAt(0)] }));
  run.runUntil(1);
  assert.deepEqual(codes(run), ["N004"]);
  assert.match(run.diagnostics[0].message, /step threw: boom/);
  assert.equal(run.state("level").player.x, 3, "the last good state");
  assert.ok(run.state("fx").t > 0.9);
  // an init that throws: the part never steps, and its outputs have no snapshot (an Event wire carries nothing)
  const F = fxKit();
  const R = defineRuntime(F.grammar, { clock: () => ({ tick: 1 / 30 }), init: () => { throw new Error("no"); }, step: (/** @type {any} */ s) => s, events: { in: { burst: 8 } } });
  const r2 = note(createRun(bursts({ fx: F }).composed, { runtimes: [mazeKit().runtime, R] }));
  r2.runUntil(1 / 4);
  assert.deepEqual(codes(r2), ["N004"]);
  assert.equal(r2.diagnostics[0].part, "fx");
  assert.equal(r2.diagnostics[0].T, null);
  assert.match(r2.diagnostics[0].message, /init threw: no/);
  assert.equal(r2.state("fx"), null);
  assert.ok(r2.state("level").t > 0.2);
});

test("N006: a clock that is not one is refused when the run is created", () => {
  const M = mazeKit({ clock: () => ({ tick: 0 }) });
  const { composed } = bursts({ maze: mazeKit() });
  assert.throws(() => createRun(composed, { runtimes: [M.runtime, fxKit().runtime] }), (/** @type {any} */ e) => {
    assert.ok(e instanceof RunError);
    assert.deepEqual(e.diagnostics.map((/** @type {any} */ d) => d.code), ["N006"]);
    seen.add("N006");
    return true;
  });
});

test("S116: a composition whose reliable queue can overflow is refused before any step, naming both sides", () => {
  const F = fxKit({ clock: { tick: 1 / 4 } });
  const { composed } = bursts({ fx: fxKit() });
  assert.throws(() => createRun(composed, { runtimes: [mazeKit().runtime, F.runtime] }), (/** @type {any} */ e) => {
    assert.ok(e instanceof RunError);
    assert.deepEqual(e.diagnostics.map((/** @type {any} */ d) => d.code), ["S116"]);
    assert.match(e.message, /level\.out\.picked → fx\.in\.burst can hold 16 records/);
    return true;
  });
});

test("N007: a composed record whose wire overflow is neither keepLast nor keepFirst is refused, and both policies still run", () => {
  const { composed } = bursts({ fx: fxKit({ clock: { tick: 1 / 4 } }), wire: { overflow: "keepLast" } });
  const runtimes = [mazeKit().runtime, fxKit({ clock: { tick: 1 / 4 } }).runtime];
  const withOverflow = (/** @type {any} */ overflow) => ({ ...composed, wires: composed.wires.map((w) => (w.overflow ? { ...w, overflow } : w)) });
  for (const overflow of ["keepLast", "keepFirst"]) assert.doesNotThrow(() => createRun(withOverflow(overflow), { runtimes }));
  for (const overflow of ["drop", true, 1, ""]) {
    assert.throws(() => createRun(withOverflow(overflow), { runtimes }), (/** @type {any} */ e) => {
      assert.ok(e instanceof RunError);
      assert.ok(e.diagnostics.some((/** @type {any} */ d) => d.code === "N007"), `${JSON.stringify(overflow)}`);
      assert.match(e.message, /keepLast.*keepFirst/);
      return true;
    });
  }
  seen.add("N007");
});

test("a part with no runtime is refused when the run is created", () => {
  const { composed } = bursts();
  assert.throws(() => createRun(composed, { runtimes: [mazeKit().runtime] }), /part 'fx' \(particles\) has no runtime/);
});

test("every N code but N001, N005, N008, N009, N010, N011, N012 and N013 has a case here (the driver's, replay's, param-wire.test.js's, input-record.test.js's, and controls.test.js's and pointer.test.js's for N013)", () => {
  for (const r of runs) for (const c of codes(r)) seen.add(c);
  for (const c of Object.keys(RUN_CODES)) if (!["N001", "N005", "N008", "N009", "N010", "N011", "N012", "N013"].includes(c)) assert.ok(seen.has(c), `no case for ${c}`);
});
