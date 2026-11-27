// @ts-nocheck: the fixture Grammar is built at run time, so its builder chains are untyped.
// A param input judged against the record it will apply under (review of d0b876c, leaf GYDKN0): until then N008
// checked the part's record as it stood when the input was logged, so a log that widened a range by a rebuild and
// then used the new range could not be restarted or replayed, and live, an edit queued behind a widening rebuild was
// refused. Also what the run refuses at insert because it is knowable there: an input naming no part (N009) and a
// build-time param edit to a run with no build option (N010).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRun, RunError, replay } from "../index.js";
import { run as runProgram, name, data } from "../../define/index.js";
import { compose } from "../../compose/index.js";
import { tiny } from "./helpers.js";

const PARAM = { kind: "decl", args: [name("param"), data({ value: "number", min: "number", max: "number" })], as: "params" };
const W = tiny("w", { state: { size: "f64", t: "f64" }, inputs: false, ports: { out: {}, in: {} }, slots: { param: PARAM } }, {
  clock: () => ({ tick: 1 / 4 }),
  // a record of size 13 fails its init, so a rebuild to it keeps the previous revision running
  init: (r) => { if (r.size === 13) throw new Error("size 13 does not start"); return { size: r.size ?? -1, t: 0 }; },
  step: (s, ctx) => ({ size: s.size, t: s.t + ctx.dt * ctx.params.speed }),
});
const g = W.grammar;
/** speed's max as given; size 6 unless given. */
const rec = (max, size = 6) => runProgram(() => g("box").param("speed", { value: 1, min: 0, max }).size(size)).record;
/** A composition of the one part, built with `record`. */
const comp = (record) => {
  const c = compose("c").part(g("box").param("speed", { value: 1, min: 0, max: 4 }).size(6)).build({ runtimes: [W.runtime] });
  return { ...c, parts: [{ ...c.parts[0], record }] };
};
const opts = { runtimes: [W.runtime], checkpointEvery: 0.25 };
const isRefusal = (code) => (e) => e instanceof RunError && e.diagnostics.length === 1 && e.diagnostics[0].code === code;
/** The parts of a run a refused input must leave as they were. */
const shape = (run) => ({ inputs: run.log.inputs.length, params: run.params("box"), T: run.seconds, builds: run.builds.length, diagnostics: run.diagnostics.length });

/** A live run that widens speed to 0..100 by a rebuild at 3/4, then sets 50 once the rebuild has applied. */
function widened() {
  const live = createRun(comp(rec(4)), opts);
  live.runUntil(0.5);
  live.input({ kind: "rebuild", part: "box", record: rec(100) });
  live.runUntil(0.75);
  live.input({ kind: "param", part: "box", name: "speed", value: 50 });
  live.runUntil(2);
  return live;
}

test("a log whose rebuild widened a range, then used it, restarts and replays (finding 1)", () => {
  const live = widened();
  assert.deepEqual(live.params("box"), { speed: 50 });
  const again = createRun(comp(rec(4)), { ...opts, inputs: live.log.inputs });
  again.runUntil(2);
  assert.deepEqual(again.params("box"), { speed: 50 });
  assert.equal(again.state("box").t, live.state("box").t);
  assert.equal(replay(comp(rec(4)), opts, live.record()).ok, true);
});

test("live: an edit queued behind a widening rebuild not yet applied is logged, and applies under the new record", () => {
  const live = createRun(comp(rec(4)), opts);
  live.runUntil(0.5);
  live.input({ kind: "rebuild", part: "box", record: rec(100) });
  live.input({ kind: "param", part: "box", name: "speed", value: 50 });
  assert.equal(live.log.inputs.length, 2);
  live.runUntil(1.5);
  assert.deepEqual(live.params("box"), { speed: 50 });
  assert.deepEqual(live.diagnostics, []);
  assert.equal(replay(comp(rec(4)), opts, live.record()).ok, true);
});

test("a value that fits no record that can be in force at its instant is still refused before it is logged (N008)", () => {
  const live = createRun(comp(rec(4)), opts);
  live.runUntil(0.5);
  live.input({ kind: "rebuild", part: "box", record: rec(100) });
  const before = shape(live);
  assert.throws(() => live.input({ kind: "param", part: "box", name: "speed", value: 500 }), isRefusal("N008"));
  assert.deepEqual(shape(live), before);
  // and a handed log that holds one is refused at the start
  assert.throws(() => createRun(comp(rec(4)), { ...opts, inputs: [{ kind: "rebuild", T: 0.5, part: "box", record: rec(100) }, { kind: "param", T: 1, part: "box", name: "speed", value: 500 }] }), isRefusal("N008"));
  // what must still work: a value inside the old range, behind the same rebuild
  assert.doesNotThrow(() => live.input({ kind: "param", part: "box", name: "speed", value: 3 }));
});

test("an edit behind a narrowing rebuild not yet applied that fits only the old record is logged, but not applied once the rebuild lands: N008", () => {
  const live = createRun(comp(rec(100)), opts);
  live.runUntil(0.5);
  live.input({ kind: "rebuild", part: "box", record: rec(4) });
  live.input({ kind: "param", part: "box", name: "speed", value: 50 }); // the rebuild could fail, and 0..100 stay in force
  live.runUntil(1.5);
  assert.deepEqual(live.params("box"), { speed: 1 }, "never applied under a record it does not fit");
  assert.deepEqual(live.diagnostics.map((d) => [d.code, d.part, d.T]), [["N008", "box", "3/4"]]);
  assert.match(live.diagnostics[0].message, /box\.\$\.speed takes a value inside 0\.\.4, not 50/);
  assert.equal(replay(comp(rec(100)), opts, live.record()).ok, true);
});

test("a log whose narrowing rebuild failed, then used the old range, restarts and replays: the old record stayed in force", () => {
  const live = createRun(comp(rec(100)), opts);
  live.runUntil(0.5);
  live.input({ kind: "rebuild", part: "box", record: rec(4, 13) });
  live.runUntil(0.75);
  assert.equal(live.builds.at(-1).ok, false, "the rebuild failed");
  live.input({ kind: "param", part: "box", name: "speed", value: 50 });
  live.runUntil(1.5);
  assert.deepEqual(live.params("box"), { speed: 50 });
  const again = createRun(comp(rec(100)), { ...opts, inputs: live.log.inputs });
  again.runUntil(1.5);
  assert.deepEqual(again.params("box"), { speed: 50 });
  assert.equal(replay(comp(rec(100)), opts, live.record()).ok, true);
});

/** speed's max is the build-time param n, so the record a build-time edit gives is known only by building it. */
const bounded = ($) => g("box").param("n", { value: 3, min: 1, max: 9 }).param("speed", { value: 1, min: 0, max: $.n }).size(6);
const build = (_part, values) => runProgram(bounded, { values }).record;
const boundedComp = () => comp(runProgram(bounded).record);

test("a range set by a build-time param: an edit behind the build-time edit is logged and judged when it applies", () => {
  const live = createRun(boundedComp(), { ...opts, build });
  live.runUntil(0.5);
  live.input({ kind: "param", part: "box", name: "n", value: 8 });
  live.input({ kind: "param", part: "box", name: "speed", value: 7 }); // queued behind n = 8, not yet built
  live.runUntil(1);
  assert.deepEqual(live.params("box"), { n: 8, speed: 7 });
  assert.deepEqual(live.diagnostics, []);
  assert.equal(replay(boundedComp(), { ...opts, build }, live.record()).ok, true);
  const again = createRun(boundedComp(), { ...opts, build, inputs: live.log.inputs });
  again.runUntil(1);
  assert.deepEqual(again.params("box"), { n: 8, speed: 7 });
  // one past the range the build gives is logged too, and not applied: N008 when it applies
  const low = createRun(boundedComp(), { ...opts, build });
  low.runUntil(0.5);
  low.input({ kind: "param", part: "box", name: "n", value: 2 });
  low.input({ kind: "param", part: "box", name: "speed", value: 3 });
  low.runUntil(1);
  assert.deepEqual(low.params("box"), { n: 2, speed: 1 });
  assert.deepEqual(low.diagnostics.map((d) => d.code), ["N008"]);
});

test("an input naming a part the composition lacks is refused before it is logged: N009, the run unchanged (finding 2)", () => {
  for (const e of [
    { kind: "param", part: "nope", name: "speed", value: 3 },
    { kind: "control", part: "nope", name: "pad", value: 1 },
    { kind: "rebuild", part: "nope", record: rec(4) },
  ]) {
    const live = createRun(comp(rec(4)), opts);
    live.runUntil(0.5);
    const before = shape(live);
    assert.throws(() => live.input(e), (x) => isRefusal("N009")(x) && /names no part 'nope': the parts are box/.test(x.message), e.kind);
    assert.deepEqual(shape(live), before, e.kind);
    assert.throws(() => createRun(comp(rec(4)), { ...opts, inputs: [{ ...e, T: 1 }] }), isRefusal("N009"), e.kind);
  }
  // what must still work: the part by its name
  const live = createRun(comp(rec(4)), opts);
  assert.doesNotThrow(() => live.input({ kind: "param", part: "box", name: "speed", value: 3 }));
});

test("a build-time param edit to a run with no build option is refused before it is logged: N010; a run-time one is applied (finding 2)", () => {
  const program = ($) => g("box").param("n", { value: 3, min: 1, max: 9 }).param("speed", { value: 1, min: 0, max: 4 }).size($.n * 2);
  const live = createRun(comp(runProgram(program).record), opts);
  live.runUntil(0.5);
  const before = shape(live);
  assert.throws(() => live.input({ kind: "param", part: "box", name: "n", value: 5 }), (x) => isRefusal("N010")(x) && /box\.\$\.n is read at build time/.test(x.message) && /no build\(part, params\)/.test(x.message));
  assert.deepEqual(shape(live), before);
  assert.throws(() => createRun(comp(runProgram(program).record), { ...opts, inputs: [{ kind: "param", T: 1, part: "box", name: "n", value: 5 }] }), isRefusal("N010"));
  live.input({ kind: "param", part: "box", name: "speed", value: 2 });
  live.runUntil(1);
  assert.deepEqual(live.params("box"), { n: 3, speed: 2 });
});

test("a build that throws for an in-range value throws out of the call that applies it; the input stays logged and the run goes on (kept as it was)", () => {
  const program = ($) => g("box").param("n", { value: 3, min: 1, max: 9 }).param("speed", { value: 1, min: 0, max: 4 }).size($.n * 2);
  const throwing = (_part, values) => { if (values.n === 7) throw new Error("n may not be 7"); return runProgram(program, { values }).record; };
  const live = createRun(comp(runProgram(program).record), { ...opts, build: throwing });
  live.runUntil(0.5);
  live.input({ kind: "param", part: "box", name: "n", value: 7 });
  assert.throws(() => live.runUntil(1), /n may not be 7/);
  assert.equal(live.log.inputs.length, 1, "the input is logged, so a replay of the log throws at the same input");
  assert.equal(live.params("box").n, 7, "its value is in $");
  assert.equal(live.state("box").size, 6, "and the part keeps its build");
  assert.doesNotThrow(() => live.runUntil(2));
});
