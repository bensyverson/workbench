// The queue window S116 sizes and the real-time driver honors: a frame consumer's step takes the records stamped
// since its last frame, and every frame covers at most the run's catch-up cap of workbench time (the first frame
// included, merged short frames, a pause and step, a rewind). A step that would take more than its runtime declares
// stops its part loudly (N002) instead of taking them. S116 counts producer steps per window without over-counting
// (frame → frame, coinciding tick clocks), and an overload that never ends is reported while it lasts (N001).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRun, createDriver, replay } from "../index.js";
import { compose } from "../../compose/index.js";
import { list } from "../../define/index.js";
import { queueProblems } from "../../compose/queues.js";
import { parseQ, toNumber, sub } from "../../define/rational.js";
import { pair, ticker, tiny } from "./helpers.js";

/** tick 1/20 → frame, catchUp 1/10: S116's bound is ceil((1/10) / (1/20)) × 1 = 2, the consumer's max. */
function tickToFrame() {
  const { composed, runtimes } = pair({ prodClock: { tick: 1 / 20 }, consClock: { frame: true }, per: 1, max: 2 });
  const run = createRun(composed, { runtimes, frames: "display", catchUp: 0.1, dev: false });
  return { run, driver: createDriver(run) };
}

/** Each logged frame's span of workbench time, from the previous frame (the run starts at a frame at T = 0). @param {any} run */
function frameSpans(run) {
  let prev = parseQ("0");
  return run.log.inputs.filter((/** @type {any} */ e) => e.kind === "frame").map((/** @type {any} */ e) => { const t = parseQ(e.T); const s = toNumber(sub(t, prev)); prev = t; return s; });
}

/** Every record the producer pushed by the run's T reached the consumer, once, in order (none left behind). @param {any} run */
function allDelivered(run) {
  const n = run.state("a").n, got = run.state("b").got;
  assert.deepEqual(got, Array.from({ length: got.length }, (_, i) => i));
  assert.ok(n - got.length <= 2, `${n} pushed, ${got.length} taken`);
}

test("the first frame's window is half-open: the run starts at a frame at T = 0, so no step takes more than S116 counts", () => {
  const { run, driver } = tickToFrame();
  assert.equal(driver.frame(1.0), "1/10");
  assert.equal(run.state("b").biggest, 2);
  // the frame part stepped at 0 (dt 0), taking the producer's record stamped 0
  assert.deepEqual(run.state("b").Ts.slice(0, 1), [0]);
  allDelivered(run);
  assert.deepEqual(run.diagnostics.filter((/** @type {any} */ d) => d.severity === "error"), []);
});

test("a merged short frame does not widen the next frame past the cap: every logged frame covers at most catchUp", () => {
  const { run, driver } = tickToFrame();
  driver.frame(0.049);
  assert.equal(driver.frame(0.004), null); // shorter than 1/240 s after the last frame: merged
  driver.frame(1.0);
  for (let i = 0; i < 20; i++) driver.frame(i % 3 === 0 ? 0.003 : i % 3 === 1 ? 0.3 : 1 / 60);
  assert.ok(frameSpans(run).every((/** @type {number} */ s) => s <= 0.1 + 1e-12), JSON.stringify(frameSpans(run)));
  assert.ok(run.state("b").biggest <= 2, String(run.state("b").biggest));
  allDelivered(run);
});

test("pause, step and resume: a paused step advances frame parts too, so the next frame's window stays within the cap", () => {
  const { run, driver } = tickToFrame();
  driver.frame(0.02);
  driver.pause();
  for (let i = 0; i < 10; i++) driver.step();
  driver.resume();
  driver.frame(0.02);
  assert.ok(run.state("b").biggest <= 2, String(run.state("b").biggest));
  assert.ok(frameSpans(run).every((/** @type {number} */ s) => s <= 0.1 + 1e-12), JSON.stringify(frameSpans(run)));
  allDelivered(run);
});

test("a paused step on a workbench of frame parts only advances one nominal frame", () => {
  const { composed, runtimes } = pair({ prodClock: { frame: true }, consClock: { frame: true }, per: 1, max: 1 });
  const run = createRun(composed, { runtimes, frames: "display", dev: false });
  const driver = createDriver(run);
  driver.pause();
  assert.equal(driver.step()?.T, "0");
  assert.ok(driver.step());
  assert.ok(Math.abs(run.seconds - 1 / 60) < 0.001, String(run.seconds));
  assert.deepEqual(run.state("b").got, [0, 1]);
});

test("a rewind under the driver: the next frame starts from the rewound T, capped as usual", () => {
  const { run, driver } = tickToFrame();
  for (let i = 0; i < 120; i++) driver.frame(1 / 60);
  run.rewind(1);
  assert.equal(run.seconds, 1);
  driver.frame(1 / 60);
  assert.ok(run.seconds > 1 && run.seconds <= 1.1, String(run.seconds));
  assert.ok(run.state("b").biggest <= 2, String(run.state("b").biggest));
  allDelivered(run);
});

test("one catch-up cap: the driver takes the run's, and a driver given its own is refused", () => {
  const { composed, runtimes } = pair({ prodClock: { tick: 1 / 60 }, consClock: { frame: true }, per: 1, max: 4 });
  const run = createRun(composed, { runtimes, frames: "display", dev: false });
  assert.throws(() => createDriver(run, /** @type {any} */ ({ catchUp: 0.5 })), /catchUp is the run's/);
  const driver = createDriver(run);
  driver.frame(0.01);
  driver.frame(2);
  assert.equal(run.log.header.catchUp, "1/15");
  assert.ok(run.seconds <= 0.01 + 1 / 15 + 1e-9, String(run.seconds));
  assert.ok(run.state("b").biggest <= 4, String(run.state("b").biggest));
});

test("N002: a step that would take more records than its Event input declares stops its part, taking none", () => {
  // a display log whose frames are farther apart than the cap S116 sized for (a hand-written log, say)
  const { composed, runtimes } = pair({ prodClock: { tick: 1 / 20 }, consClock: { frame: true }, per: 1, max: 2 });
  const run = createRun(composed, { runtimes, frames: "display", catchUp: 0.1, dev: false, inputs: [{ kind: "frame", T: 0.1 }, { kind: "frame", T: 0.5 }] });
  run.runUntil(1);
  // the frame at 1/10 is within the window and delivers; the one at 1/2 would hand b eight records
  assert.deepEqual(run.state("b").got, [0, 1, 2]);
  const d = run.diagnostics.filter((/** @type {any} */ x) => x.code === "N002");
  assert.equal(d.length, 1);
  assert.equal(d[0].part, "b");
  assert.equal(d[0].T, "1/2");
  assert.match(d[0].message, /in\.e: 8 records are ready, and the runtime declares at most 2 per step/);
  assert.equal(run.state("a").n, 21, "the producer runs on");
  // the eight records it refused, and the ten pushed while it is stopped, are dropped and counted
  assert.deepEqual(run.stats().stopped, { "a.out.e → b.in.e": 18 });
});

test("N001 while an overload lasts: a run that never catches up reports it, and the report grows with it", () => {
  const { composed, runtimes } = pair({ prodClock: { tick: 1 / 20 }, consClock: { frame: true }, per: 1, max: 16 });
  const run = createRun(composed, { runtimes, frames: "display", dev: false });
  const driver = createDriver(run);
  for (let i = 0; i < 4; i++) driver.frame(0.5);
  let n001 = run.diagnostics.filter((/** @type {any} */ d) => d.code === "N001");
  assert.equal(n001.length, 1);
  assert.match(n001[0].message, /has run at 0\.13× for 2 s of wall time/);
  for (let i = 0; i < 56; i++) driver.frame(0.5);
  n001 = run.diagnostics.filter((/** @type {any} */ d) => d.code === "N001");
  assert.equal(n001.length, 1);
  assert.match(n001[0].message, /has run at 0\.13× for 30 s of wall time/);
  driver.frame(1 / 60);
  n001 = run.diagnostics.filter((/** @type {any} */ d) => d.code === "N001");
  assert.equal(n001.length, 1);
  assert.match(n001[0].message, /ran at 0\.13× for 30 s of wall time/);
  assert.deepEqual(run.stats().slowdowns.map((/** @type {any} */ s) => s.wall), [30]);
});

test("a rewind into an overload restores its N001 as it stood then", () => {
  const { composed, runtimes } = pair({ prodClock: { tick: 1 / 20 }, consClock: { frame: true }, per: 1, max: 16 });
  const run = createRun(composed, { runtimes, frames: "display", dev: false, checkpointEvery: 0.1 });
  const driver = createDriver(run);
  for (let i = 0; i < 30; i++) driver.frame(0.5);
  driver.frame(1 / 60);
  run.rewind(1);
  const n001 = run.diagnostics.filter((/** @type {any} */ d) => d.code === "N001");
  assert.equal(n001.length, 1);
  assert.match(n001[0].message, /has run at 0\.13× for 7\.5 s of wall time/);
});

/** S116's problems for the pair's wire, at max 1, with any extra parts. @param {any} o */
function s116(o) {
  const free = pair({ ...o, max: 100000 });
  const sized = free.composed.parts.map((p) => ({ name: p.name, dialect: p.dialect, record: p.record }));
  const cons = { ...free.runtimes[1], events: { out: {}, in: { e: 1 } } };
  return queueProblems(sized, [{ from: { part: "a", name: "e" }, to: { part: "b", name: "e" }, delivery: "reliable" }], [free.runtimes[0], cons, ...free.runtimes.slice(2)]);
}

test("S116 counts one producer step per window where both step on the same frames: frame → frame fits at the producer's max", () => {
  assert.deepEqual(s116({ prodClock: { frame: true }, consClock: { frame: true }, per: 1 }), []);
  assert.deepEqual(s116({ prodClock: { frame: true }, consClock: { frame: true }, per: 1, wire: { delay: true } }), []);
  // and still refuses what can overflow: two records a step into a max of 1
  assert.deepEqual(s116({ prodClock: { frame: true }, consClock: { frame: true }, per: 2 }).map((p) => p.bound), [2]);
  // the run agrees: one record per consumer step
  const { composed, runtimes } = pair({ prodClock: { frame: true }, consClock: { frame: true }, per: 1, max: 1 });
  const run = createRun(composed, { runtimes, dev: false });
  run.runUntil(1);
  assert.equal(run.state("b").biggest, 1);
});

test("S116 counts a demand producer's steps by distinct instants: coinciding tick clocks make one instant, not two", () => {
  assert.deepEqual(s116({ prodClock: { demand: true }, consClock: { tick: 1 / 8 }, per: 1, extra: [ticker("t", { tick: 1 / 8 })] }), []);
  // 1/8 and 1/12 inside a 1/4 window: instants at 1/12, 1/8, 1/6, 1/4 (and the consumer's own): four
  const four = s116({ prodClock: { demand: true }, consClock: { tick: 1 / 4 }, per: 1, extra: [ticker("t", { tick: 1 / 8 }), ticker("u", { tick: 1 / 12 })] });
  assert.deepEqual(four.map((p) => p.bound), [4]);
});

test("S116 still bounds a frame consumer of a tick producer by the cap", () => {
  assert.deepEqual(s116({ prodClock: { tick: 1 / 60 }, consClock: { frame: true }, per: 1 }).map((p) => p.bound), [4]);
});

test("S116 counts one frame per frame consumer's window: a demand producer steps at most once a frame plus once per tick instant in it", () => {
  assert.deepEqual(s116({ prodClock: { demand: true }, consClock: { frame: true }, per: 1 }), []);
  // a 1/60 ticker makes at most 4 instants in the cap (1/15 s), and the frame itself is one more
  assert.deepEqual(s116({ prodClock: { demand: true }, consClock: { frame: true }, per: 1, extra: [ticker("t", { tick: 1 / 60 })] }).map((p) => p.bound), [5]);
  // and still refuses what can overflow: two records a step into a max of 1
  assert.deepEqual(s116({ prodClock: { demand: true }, consClock: { frame: true }, per: 2 }).map((p) => p.bound), [2]);
});

test("a demand producer woken every frame into a frame consumer of max 1 runs under the driver without overflowing", () => {
  // src (frame) → value v → mid (demand: one Event per step, woken by v changing) → e → sink (frame, max 1)
  const src = tiny("src", { state: { k: "f64" }, inputs: false, ports: { out: { v: { seam: "f64", from: "k" } } } },
    { clock: () => ({ frame: true }), init: () => ({ k: 0 }), step: (/** @type {any} */ s) => ({ k: s.k + 1 }) });
  const mid = tiny("mid", { state: { n: "f64" }, ports: { in: { v: { seam: "f64", default: 0 } }, out: { e: { seam: "Event<{ n: f64 }>" } } } },
    { clock: () => ({ demand: true }), init: () => ({ n: 0 }), step: (/** @type {any} */ s, /** @type {any} */ c) => { c.events.e.push({ n: s.n }); return { n: s.n + 1 }; }, events: { out: { e: 1 } } });
  const sink = tiny("sink", { state: { got: list("f64", 100000), biggest: "f64" }, inputs: false, ports: { in: { e: { seam: "Event<{ n: f64 }>" } } } },
    { clock: () => ({ frame: true }), init: () => ({ got: [], biggest: 0 }), step: (/** @type {any} */ s, /** @type {any} */ c) => ({ got: [...s.got, ...c.inputs.e.map((/** @type {any} */ r) => r.n)], biggest: Math.max(s.biggest, c.inputs.e.length) }), events: { in: { e: 1 } } });
  const a = /** @type {any} */ (src.grammar("a")), m = /** @type {any} */ (mid.grammar("m")), b = /** @type {any} */ (sink.grammar("b"));
  const runtimes = [src.runtime, mid.runtime, sink.runtime];
  const composed = compose("c").part(a).part(m).part(b).wire(a.out.v, m.in.v).wire(m.out.e, b.in.e).build({ runtimes });
  const run = createRun(composed, { runtimes, frames: "display", dev: false });
  const driver = createDriver(run);
  for (let i = 0; i < 500; i++) driver.frame([0.001, 0.004, 1 / 60, 0.05, 0.5][i % 5]);
  driver.pause(); for (let i = 0; i < 20; i++) driver.step(); driver.resume();
  for (let i = 0; i < 50; i++) driver.frame(0.3);
  assert.deepEqual(run.diagnostics.filter((/** @type {any} */ d) => d.severity === "error"), []);
  assert.equal(run.state("b").biggest, 1);
});

for (const how of ["frame", "step"]) {
  test(`runUntil on a display run, then a driver ${how}: frames were logged up to T, so the next one counts from it and nothing overflows`, () => {
    const { run, driver } = tickToFrame();
    driver.frame(1 / 60);
    run.runUntil(1); // a skip ahead from the host, on the same run
    assert.equal(run.lastFrame.n / run.lastFrame.d, 1);
    if (how === "frame") driver.frame(1 / 60); else driver.step();
    assert.ok(run.seconds > 1 && run.seconds <= 1.1, String(run.seconds));
    assert.deepEqual(run.diagnostics, []);
    assert.ok(frameSpans(run).every((/** @type {number} */ s) => s <= 1 / 60 + 1e-12 || s <= 0.1), JSON.stringify(frameSpans(run)));
    assert.ok(run.state("b").biggest <= 2, String(run.state("b").biggest));
    allDelivered(run);
    const { composed, runtimes } = pair({ prodClock: { tick: 1 / 20 }, consClock: { frame: true }, per: 1, max: 2 });
    assert.deepEqual(replay(composed, { runtimes, dev: false }, run.record()).diagnostics, []);
  });
}

test("runUntil on a display run logs frames at most a nominal frame apart, none closer than 1/240 s, and a replay logs none", () => {
  const { run } = tickToFrame();
  run.runUntil(0.1);
  assert.deepEqual(run.log.inputs.map((/** @type {any} */ e) => e.T), ["1/60", "1/30", "1/20", "1/15", "1/12", "1/10"]);
  run.runUntil(0.102); // closer than 1/240 s to the last frame: none logged
  assert.equal(run.log.inputs.length, 6);
  run.runUntil(0.11);
  assert.deepEqual(run.log.inputs.slice(6).map((/** @type {any} */ e) => e.T), ["11/100"]);
  const { composed, runtimes } = pair({ prodClock: { tick: 1 / 20 }, consClock: { frame: true }, per: 1, max: 2 });
  const r = replay(composed, { runtimes, dev: false }, run.record());
  assert.deepEqual(r.diagnostics, []);
  assert.equal(r.run.log.inputs.length, 7);
});

test("a display run of frame parts only takes an input with the default stamp, after the run's T", () => {
  const { composed, runtimes } = pair({ prodClock: { frame: true }, consClock: { frame: true }, per: 1, max: 1 });
  const run = createRun(composed, { runtimes, frames: "display", dev: false });
  const driver = createDriver(run);
  driver.frame(1 / 60);
  driver.frame(1 / 60);
  assert.equal(run.nextInstant(), null);
  const e = run.input({ kind: "control", part: "a", name: "pad", value: 1 });
  assert.equal(`${e.T.n}/${e.T.d}`, "17/500"); // the first millisecond after T = 33/1000
  driver.frame(1 / 60);
  assert.deepEqual(run.diagnostics, []);
  assert.deepEqual(replay(composed, { runtimes, dev: false }, run.record()).diagnostics, []);
});
