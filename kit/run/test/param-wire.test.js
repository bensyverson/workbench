// A wire into a param (the seams draft's rulings, 2026-11-26, leaf x3iG6D): kit/run applies it between instants,
// only when the value changes, as a logged param input stamped with the instant that made it and applied right
// after that instant, ahead of every later one (R2), marked with the wire it came from. A run from a log applies a
// logged one once.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRun, replay } from "../index.js";
import { run as runProgram } from "../../define/index.js";
import { compose } from "../../compose/index.js";
import { tiny } from "./helpers.js";

/**
 * A producer `a` (every 1/10 s, its output `v` counting up to `top`) and a consumer `b` whose `size` is built from
 * its param `level` (size = level × 10) and whose init keeps it; `level` is wired from `a.out.v`. `decl` changes
 * b's recorded param declaration (its bounds), as a Program that declared them would.
 * `prodTick` and `consTick` (1/10 s each by default) are the two clocks; `consFrame` makes b step on frames.
 * @param {{ top?: number, decl?: Record<string, unknown>, prodTick?: number, consTick?: number, consFrame?: boolean }} [o]
 */
function wired(o = {}) {
  const top = o.top ?? 2;
  const P = tiny("prod", { state: { n: "f64" }, inputs: false, ports: { out: { v: { seam: "f64", from: "n" } } } },
    { clock: () => ({ tick: o.prodTick ?? 1 / 10 }), init: () => ({ n: 0 }), step: (/** @type {any} */ s) => ({ n: Math.min(s.n + 1, top) }) });
  const C = tiny("cons", { state: { built: "f64" }, inputs: false, ports: { out: {}, in: {} } },
    { clock: () => (o.consFrame ? { frame: true } : { tick: o.consTick ?? 1 / 10 }), init: (/** @type {any} */ r) => ({ built: r.size ?? -1 }), step: (/** @type {any} */ s) => s });
  const program = (/** @type {any} */ $) => /** @type {any} */ (C.grammar("b").param("level", { value: 0 }).size($.level * 10));
  const a = /** @type {any} */ (P.grammar("a")), b = program({ level: 0 });
  const runtimes = [P.runtime, C.runtime];
  const composed = compose("w").part(a).part(b).wire(a.out.v, b.param.level).build({ runtimes });
  /** b's record as the host builds it, with its build-time reads. @param {Record<string, unknown>} [values] */
  const build = (values = {}) => {
    const r = /** @type {Record<string, any>} */ (runProgram(program, { values }).record);
    return o.decl ? { ...r, params: { ...r.params, level: { ...r.params.level, ...o.decl } } } : r;
  };
  const rec = { ...composed, parts: composed.parts.map((p) => (p.name === "b" ? { ...p, record: build() } : p)) };
  return { composed: rec, options: { runtimes, build: (/** @type {string} */ _p, /** @type {Record<string, unknown>} */ v) => build(v) } };
}

test("a param wire sets the param right after the instant its output changed at, as a logged param input stamped with that instant, and the part rebuilds", () => {
  const { composed, options } = wired();
  const run = createRun(composed, options);
  run.runUntil(1);
  const params = run.log.inputs.filter((e) => e.kind === "param");
  assert.deepEqual(params, [
    { kind: "param", T: "0", part: "b", name: "level", value: 1, wire: "a.out.v" },
    { kind: "param", T: "1/10", part: "b", name: "level", value: 2, wire: "a.out.v" },
  ]);
  assert.deepEqual(run.builds.map((e) => [e.boundary, e.trigger.kind, e.revision.after]), [[{ after: "0", before: "0" }, "param", 2], [{ after: "1/10", before: "1/10" }, "param", 3]]);
  assert.deepEqual(run.state("b"), { built: 20 });
});

test("an output that equals the param's value sets nothing", () => {
  const { composed, options } = wired({ top: 0 });
  const run = createRun(composed, options);
  run.runUntil(1);
  assert.deepEqual(run.log.inputs, []);
  assert.deepEqual(run.builds, []);
});

test("the run is the same however runUntil is chunked", () => {
  const { composed, options } = wired({ top: 4 });
  const whole = createRun(composed, options);
  whole.runUntil(1);
  const chunked = createRun(composed, options);
  for (let k = 1; k <= 30; k++) chunked.runUntil({ n: k, d: 30 });
  assert.deepEqual(chunked.hashes, whole.hashes);
  assert.deepEqual(chunked.builds, whole.builds);
  assert.deepEqual(chunked.log, whole.log);
});

test("a replay of a JSON round-tripped record matches, applying each logged param-wire input once", () => {
  const { composed, options } = wired({ top: 3 });
  const run = createRun(composed, options);
  run.runUntil(1);
  const r = replay(composed, options, JSON.parse(JSON.stringify(run.record())));
  assert.equal(r.ok, true, JSON.stringify(r.diagnostics));
  assert.deepEqual(r.run.log.inputs, run.log.inputs);
  assert.deepEqual(r.run.builds, run.builds);
  // a run started from the log and carried on past it goes on applying the wire live
  const more = createRun(composed, { ...options, inputs: run.log.inputs });
  more.runUntil(2);
  assert.deepEqual(more.log.inputs.filter((e) => e.kind === "param").map((e) => e.T), ["0", "1/10", "1/5"]);
});

test("a value outside the param's declaration is not applied: N008, once per value, and the part keeps its build", () => {
  const { composed, options } = wired({ top: 3, decl: { max: 1 } });
  const run = createRun(composed, options);
  run.runUntil(1);
  assert.deepEqual(run.log.inputs.map((e) => e.value), [1]);
  assert.deepEqual(run.diagnostics.map((d) => [d.code, d.part, d.T]), [["N008", "b", "1/10"], ["N008", "b", "1/5"]]);
  assert.match(run.diagnostics[0].message, /a\.out\.v → b\.param\.level: b\.\$\.level takes a value inside -∞\.\.1, not 2, so the wire does not set it; b keeps its build/);
  assert.deepEqual(run.state("b"), { built: 10 });
});

test("the why text names the wire that set the param, in its because and inputs lines", () => {
  const { composed, options } = wired({ top: 1 });
  const run = createRun(composed, options);
  run.runUntil(1);
  const text = run.why("b");
  assert.match(text, /because: +param b\.\$\.level changed 0 → 1, set by the wire a\.out\.v → b\.param\.level, in a param input stamped T=0 s/);
  assert.match(text, /build b@2 right after instant T=0 s \(before the next instant\)/);
  assert.match(text, /inputs: +since the run started: T=0 s b\.\$\.level = 1 \(wire a\.out\.v\)/);
});

test("the param follows the output: a host's param input to a wired param holds until the next instant has run, when the wire sets it again", () => {
  const { composed, options } = wired();
  const run = createRun(composed, { ...options, inputs: [{ kind: "param", T: 0.35, part: "b", name: "level", value: 9 }] });
  run.runUntil(1);
  assert.deepEqual(run.log.inputs.map((e) => [e.T, e.value, e.wire ?? null]), [["0", 1, "a.out.v"], ["1/10", 2, "a.out.v"], ["7/20", 9, null], ["2/5", 2, "a.out.v"]]);
  assert.deepEqual(run.builds.slice(-2).map((e) => [e.boundary, /** @type {any} */ (e.trigger).to]), [[{ after: "3/10", before: "7/20" }, 9], [{ after: "2/5", before: "2/5" }, 2]], "the instant 2/5 ran with 9");
  assert.deepEqual(run.state("b"), { built: 20 });
});

// The review of 5db1d27 (leaf DJZ2z2; local/rev-pw-12's probes). A wire's input is stamped with the instant that
// made it and applies right after that instant, ahead of every later one; it is made once per change, whatever else
// the log holds at that stamp.

const roundTrip = (/** @type {any} */ run) => JSON.parse(JSON.stringify(run.record()));
/** Each wire input's stamp, in log order. @param {any} run */
const wireStamps = (run) => run.log.inputs.filter((/** @type {any} */ e) => e.wire).map((/** @type {any} */ e) => e.T);

test("a host param input at a wire input's stamp (the default: the next instant): the replay matches, and each wire input is logged once", () => {
  const { composed, options } = wired({ top: 3 });
  const run = createRun(composed, options);
  run.runUntil(0);
  run.input({ kind: "param", part: "b", name: "level", value: 2 });
  run.runUntil(0.5);
  assert.deepEqual(run.log.inputs.map((e) => [e.T, e.value, e.wire ?? null]), [["0", 1, "a.out.v"], ["1/10", 2, null], ["1/5", 3, "a.out.v"]]);
  const r = replay(composed, options, roundTrip(run));
  assert.equal(r.ok, true, JSON.stringify(r.diagnostics));
  assert.deepEqual(r.run.log.inputs, run.log.inputs);
  assert.deepEqual(r.run.builds, run.builds);
  // a rewind into the log, after the host's input, runs the same branch again
  const before = run.log;
  run.rewind(0.15);
  run.runUntil(0.5);
  assert.deepEqual(run.log, before);
});

test("a host param input stamped at the wire's own stamp: the log order decides, and the replay and a rewind match", () => {
  const first = wired({ top: 3 });
  const probe = createRun(first.composed, first.options);
  probe.runUntil(0.5);
  const at = wireStamps(probe)[0];
  const { composed, options } = wired({ top: 3 });
  const run = createRun(composed, { ...options, inputs: [{ kind: "param", T: at, part: "b", name: "level", value: 2 }] });
  run.runUntil(0.5);
  const atStamp = run.log.inputs.filter((e) => e.T === at && e.kind === "param");
  assert.deepEqual(atStamp.map((e) => [e.value, e.wire ?? null]), [[2, null], [1, "a.out.v"]], "the host's input, logged first, then the wire's");
  const r = replay(composed, options, roundTrip(run));
  assert.equal(r.ok, true, JSON.stringify(r.diagnostics));
  assert.deepEqual(r.run.log.inputs, run.log.inputs);
  const again = createRun(composed, { ...options, inputs: [{ kind: "param", T: at, part: "b", name: "level", value: 2 }] });
  again.runUntil(0.5);
  again.rewind(0.05);
  again.runUntil(0.5);
  assert.deepEqual(again.log, run.log);
  assert.deepEqual(again.hashes, run.hashes);
});

test("a log that holds a host input after the wire's at one stamp applies them in log order, after that instant", () => {
  const { composed, options } = wired({ top: 0 });
  const inputs = [
    { kind: "param", T: 0, part: "b", name: "level", value: 1, wire: "a.out.v" },
    { kind: "param", T: 0, part: "b", name: "level", value: 2 },
  ];
  const run = createRun(composed, { ...options, inputs });
  run.runUntil(0);
  assert.deepEqual(run.state("b"), { built: 20 }, "the later entry wins");
  assert.equal(run.hashes.length, 1);
  assert.deepEqual(run.builds.map((e) => e.boundary), [{ after: "0", before: "0" }, { after: "0", before: "0" }], "both right after instant 0");
  const r = replay(composed, options, roundTrip(run));
  assert.equal(r.ok, true, JSON.stringify(r.diagnostics));
});

test("a wire's input is stamped with the instant that made it and applies before the next, with ticks finer than 1 ms", () => {
  const { composed, options } = wired({ top: 4, prodTick: 1 / 2000, consTick: 1 / 3000 });
  const run = createRun(composed, options);
  /** @type {string[]} */
  const instants = [];
  let n = 0;
  for (let k = 0; k < 12; k++) {
    const s = run.step();
    if (!s) break;
    instants.push(s.T);
    // b's build follows a's output as it stood after the instant before
    assert.equal(run.state("b").built, k === 0 ? 0 : 10 * n, `after instant ${s.T}`);
    n = run.state("a").n;
  }
  assert.deepEqual(wireStamps(run), ["0", "1/2000", "1/1000", "3/2000"]);
  for (const T of wireStamps(run)) assert.ok(instants.includes(T), `${T} is an instant`);
  const r = replay(composed, options, roundTrip(run));
  assert.equal(r.ok, true, JSON.stringify(r.diagnostics));
});

test("in a display run, a wire's input is the same however runUntil is chunked, and a replay of either matches", () => {
  const { composed, options: o } = wired({ top: 5, consFrame: true });
  const options = { ...o, frames: /** @type {const} */ ("display"), catchUp: 0.1, dev: false };
  const whole = createRun(composed, options);
  whole.runUntil(0.5);
  const chunked = createRun(composed, options);
  for (let k = 1; k <= 30; k++) chunked.runUntil({ n: k, d: 60 });
  assert.deepEqual(chunked.log, whole.log);
  assert.deepEqual(chunked.hashes, whole.hashes);
  assert.deepEqual(chunked.builds, whole.builds);
  assert.deepEqual(wireStamps(whole), ["0", "1/10", "1/5", "3/10", "2/5"]);
  for (const run of [whole, chunked]) {
    const r = replay(composed, options, roundTrip(run));
    assert.equal(r.ok, true, JSON.stringify(r.diagnostics));
    assert.deepEqual(r.run.log.inputs, run.log.inputs);
  }
  // with a host input at its default stamp mid-run
  const host = createRun(composed, options);
  host.runUntil(0.15);
  host.input({ kind: "param", part: "b", name: "level", value: 9 });
  host.runUntil(0.5);
  const r = replay(composed, options, roundTrip(host));
  assert.equal(r.ok, true, JSON.stringify(r.diagnostics));
  assert.deepEqual(r.run.log.inputs, host.log.inputs);
  assert.equal(new Set(wireStamps(host)).size, wireStamps(host).length, "one wire input per stamp");
});

test("a rebuild whose record changes a param's default, or adds a param, reaches $ for params no input has set", () => {
  const L = tiny("live", { state: { speed: "f64", extra: "f64", fixed: "f64" }, inputs: false, ports: { out: {}, in: {} } }, {
    clock: () => ({ tick: 1 / 10 }),
    init: (/** @type {any} */ _r, /** @type {any} */ c) => ({ speed: c.params.speed ?? -1, extra: c.params.extra ?? -1, fixed: c.params.fixed ?? -1 }),
    step: (/** @type {any} */ _s, /** @type {any} */ c) => ({ speed: c.params.speed ?? -1, extra: c.params.extra ?? -1, fixed: c.params.fixed ?? -1 }),
  });
  const p0 = /** @type {any} */ (L.grammar("p").param("speed", { value: 1 }).param("fixed", { value: 1 }));
  const composed = compose("w").part(p0).build({ runtimes: [L.runtime] });
  const defaultOnly = /** @type {any} */ (L.grammar("p").param("speed", { value: 5 }).param("fixed", { value: 5 })).build();
  const added = /** @type {any} */ (L.grammar("p").param("speed", { value: 6 }).param("fixed", { value: 6 }).param("extra", { value: 7 })).build();
  const run = createRun(composed, {
    runtimes: [L.runtime], params: { p: { fixed: 9 } },
    inputs: [{ kind: "rebuild", T: 0.15, part: "p", record: defaultOnly }, { kind: "rebuild", T: 0.35, part: "p", record: added }],
  });
  run.runUntil(0.2);
  assert.equal(run.builds[0].changed, false, "a default alone is no change of key");
  assert.deepEqual(run.state("p"), { speed: 5, extra: -1, fixed: 9 });
  run.runUntil(0.35);
  assert.equal(run.builds[1].changed, true);
  assert.deepEqual(run.state("p"), { speed: 6, extra: 7, fixed: 9 }, "the init the rebuild runs sees them");
  run.runUntil(0.4);
  assert.deepEqual(run.state("p"), { speed: 6, extra: 7, fixed: 9 });
  const r = replay(composed, { runtimes: [L.runtime] }, roundTrip(run));
  assert.equal(r.ok, true, JSON.stringify(r.diagnostics));
});

test("a param input keeps its value over a rebuild's default, and a rewind past it forgets it was set", () => {
  const L = tiny("live", { state: { speed: "f64" }, inputs: false, ports: { out: {}, in: {} } }, {
    clock: () => ({ tick: 1 / 10 }),
    init: (/** @type {any} */ _r, /** @type {any} */ c) => ({ speed: c.params.speed }),
    step: (/** @type {any} */ _s, /** @type {any} */ c) => ({ speed: c.params.speed }),
  });
  const composed = compose("w").part(/** @type {any} */ (L.grammar("p").param("speed", { value: 1 }))).build({ runtimes: [L.runtime] });
  const moved = /** @type {any} */ (L.grammar("p").param("speed", { value: 6 })).build();
  const run = createRun(composed, { runtimes: [L.runtime], checkpointEvery: 0.1, inputs: [{ kind: "param", T: 0.25, part: "p", name: "speed", value: 3 }] });
  run.runUntil(0.3);
  run.input({ kind: "rebuild", T: 0.35, part: "p", record: moved });
  run.runUntil(0.4);
  assert.deepEqual(run.state("p"), { speed: 3 }, "set by an input: kept");
  run.rewind(0.22);
  run.input({ kind: "rebuild", T: 0.35, part: "p", record: moved });
  run.runUntil(0.4);
  assert.deepEqual(run.state("p"), { speed: 6 }, "the input is gone: the default reaches $");
});
