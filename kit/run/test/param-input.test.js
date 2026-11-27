// @ts-nocheck: the fixture Grammar is built at run time, so its builder chains are untyped.
// A part's params as the run holds them (run.params, review H1: the page host kept its own map, which outlived a
// rewind), and a param input checked when it is logged (review H2: one past its range or of the wrong type was
// applied unchecked, so a build-time param threw inside the rebuild and a run-time one ran silently).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRun, RunError, replay } from "../index.js";
import { run as runProgram, name, data } from "../../define/index.js";
import { compose } from "../../compose/index.js";
import { tiny } from "./helpers.js";

const PARAM = { kind: "decl", args: [name("param"), data({ value: "number", min: "number", max: "number" })], as: "params" };
const W = tiny("w", { state: { size: "f64", t: "f64" }, inputs: false, ports: { out: {}, in: {} }, slots: { param: PARAM } }, {
  clock: () => ({ tick: 1 / 4 }),
  init: (r) => ({ size: r.size ?? -1, t: 0 }),
  step: (s, ctx) => ({ size: s.size, t: s.t + ctx.dt * ctx.params.speed }),
});
const g = W.grammar;
/** Reads `n` at build time (the size), `speed` only at run time. */
const program = ($) => g("box").param("n", { value: 3, min: 1, max: 9 }).param("speed", { value: 1, min: 0, max: 4 }).size($.n * 2);
const build = (_part, values) => runProgram(program, { values }).record;

function start(options = {}) {
  const { record } = runProgram(program);
  const composed = compose("c").part(g("box").param("n", { value: 3, min: 1, max: 9 }).param("speed", { value: 1, min: 0, max: 4 }).size(6)).build({ runtimes: [W.runtime] });
  return createRun({ ...composed, parts: [{ ...composed.parts[0], record }] }, { runtimes: [W.runtime], build, checkpointEvery: 0.25, ...options });
}

test("run.params(part) is the part's params now, frozen: the declared values, then each input applied", () => {
  const run = start();
  assert.deepEqual(run.params("box"), { n: 3, speed: 1 });
  assert.ok(Object.isFrozen(run.params("box")));
  run.runUntil(0.5);
  run.input({ kind: "param", part: "box", name: "speed", value: 2 });
  assert.deepEqual(run.params("box"), { n: 3, speed: 1 }, "stamped at the next instant, so not applied yet");
  run.runUntil(0.75);
  assert.deepEqual(run.params("box"), { n: 3, speed: 2 });
  run.input({ kind: "param", part: "box", name: "n", value: 5 });
  run.runUntil(1);
  assert.deepEqual(run.params("box"), { n: 5, speed: 2 });
  assert.equal(run.state("box").size, 10);
  assert.throws(() => run.params("nope"), /no part 'nope'/);
});

test("run.params(part) after a rewind to before an edit is the params as they stood then", () => {
  const run = start();
  run.runUntil(1);
  run.input({ kind: "param", part: "box", name: "speed", value: 3 });
  run.input({ kind: "param", part: "box", name: "n", value: 7 });
  run.runUntil(2);
  assert.deepEqual(run.params("box"), { n: 7, speed: 3 });
  run.rewind(0.5);
  assert.deepEqual(run.params("box"), { n: 3, speed: 1 });
  run.runUntil(3);
  assert.deepEqual(run.params("box"), { n: 3, speed: 1 }, "a rewind is a branch: the edits are gone");
});

test("run.params(part) after a rebuild input takes the new record's declared value for a param nothing set", () => {
  const run = start();
  run.runUntil(0.5);
  run.input({ kind: "param", part: "box", name: "speed", value: 2 });
  const next = runProgram(($) => g("box").param("n", { value: 4, min: 1, max: 9 }).param("speed", { value: 1, min: 0, max: 4 }).size($.n * 2)).record;
  run.input({ kind: "rebuild", part: "box", record: next });
  run.runUntil(1);
  assert.deepEqual(run.params("box"), { n: 4, speed: 2 });
});

/** The parts of a run a refused input must leave as they were. */
const shape = (run) => ({ inputs: run.log.inputs.length, params: run.params("box"), T: run.seconds, builds: run.builds.length, diagnostics: run.diagnostics.length });

test("a param input past its range, of the wrong type or not finite is refused when it is logged: N008, the run unchanged", () => {
  for (const [label, name, value] of [["run-time past max", "speed", 100], ["build-time past max", "n", 100], ["build-time below min", "n", 0], ["build-time as text", "n", "5"], ["run-time NaN", "speed", NaN], ["run-time bool", "speed", true]]) {
    const run = start();
    run.runUntil(0.5);
    const before = shape(run);
    assert.throws(() => run.input({ kind: "param", part: "box", name, value }), (e) => {
      assert.ok(e instanceof RunError, label);
      assert.deepEqual(e.diagnostics.map((d) => d.code), ["N008"], label);
      assert.match(e.diagnostics[0].message, new RegExp(`box\\.\\$\\.${name}`), label);
      assert.equal(e.diagnostics[0].part, "box", label);
      return true;
    });
    assert.deepEqual(shape(run), before, label);
    run.runUntil(1.5); // and it runs on as before
    assert.equal(run.state("box").size, 6, label);
  }
});

test("a param input inside its range is still applied, at its bounds too, and the run replays", () => {
  const run = start();
  run.runUntil(0.5);
  run.input({ kind: "param", part: "box", name: "speed", value: 4 });
  run.input({ kind: "param", part: "box", name: "n", value: 9 });
  run.runUntil(1);
  assert.deepEqual(run.params("box"), { n: 9, speed: 4 });
  assert.equal(run.state("box").size, 18);
  const { record } = runProgram(program);
  const composed = compose("c").part(g("box").param("n", { value: 3, min: 1, max: 9 }).param("speed", { value: 1, min: 0, max: 4 }).size(6)).build({ runtimes: [W.runtime] });
  const again = replay({ ...composed, parts: [{ ...composed.parts[0], record }] }, { runtimes: [W.runtime], build, checkpointEvery: 0.25 }, run.record());
  assert.equal(again.ok, true);
});

test("a log handed to createRun that holds a param input the declaration refuses is refused at the start (N008)", () => {
  assert.throws(() => start({ inputs: [{ kind: "param", T: 0.5, part: "box", name: "n", value: 100 }] }), (e) => e instanceof RunError && e.diagnostics[0].code === "N008");
});
