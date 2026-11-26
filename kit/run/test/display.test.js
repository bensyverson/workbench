// runUntil on a display run (ruling R1, 2026-11-26): the frames it logs lie on the nominal grid from the last frame,
// never one at the target, whatever parts run, so chunking changes nothing, a frame part restarted mid-chunk steps
// within the cap, and the driver's next frame counts from the run's T. A display run's implied frame at T = 0 counts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRun, createDriver, replay } from "../index.js";
import { compose } from "../../compose/index.js";
import { q, qText, parseQ, toNumber, sub } from "../../define/rational.js";
import { pair, tiny } from "./helpers.js";

/** @param {any} run */
const frameTs = (run) => run.log.inputs.filter((/** @type {any} */ e) => e.kind === "frame").map((/** @type {any} */ e) => e.T);
/** Each logged frame's span from the frame before it (the run starts at a frame at T = 0). @param {any} run */
function frameSpans(run) {
  let prev = parseQ("0");
  return frameTs(run).map((/** @type {string} */ T) => { const t = parseQ(T); const s = sub(t, prev); prev = t; return s; });
}
/** @param {any} r */
const sig = (r) => JSON.stringify({ record: r.record(), diagnostics: r.diagnostics });

/** tick 1/20 → frame (max 4), catchUp 1/10; the consumer's step throws from T = 1/2 while `broken.now`. */
function display(/** @type {{ initBroken?: boolean }} */ o = {}) {
  const broken = { now: true };
  const { composed, runtimes } = pair({
    prodClock: { tick: 1 / 20 }, consClock: { frame: true }, per: 1, max: 4,
    consStep: (/** @type {any} */ s, /** @type {any} */ c) => { if (!o.initBroken && broken.now && c.T >= 0.5) throw new Error("bug"); return { got: [...s.got, ...c.inputs.e.map((/** @type {any} */ r) => r.n)], Ts: [...s.Ts, c.T], biggest: Math.max(s.biggest, c.inputs.e.length) }; },
  });
  const rts = o.initBroken ? [runtimes[0], { ...runtimes[1], init: (/** @type {any} */ r, /** @type {any} */ c) => { if (broken.now) throw new Error("bad init"); return /** @type {any} */ (runtimes[1]).init(r, c); } }] : runtimes;
  const mk = () => createRun(composed, { runtimes: rts, frames: "display", catchUp: 0.1, dev: false, packages: [{ name: "cons", content: "A" }] });
  return { composed, runtimes: rts, broken, mk, fixed: composed.parts[1].record };
}

test("R1: runUntil on a display run logs frames on the nominal grid from the last frame and none at the target, so chunking changes nothing", () => {
  const { mk, composed, runtimes, broken } = display();
  broken.now = false;
  const one = mk();
  one.runUntil(1);
  assert.deepEqual(frameTs(one), Array.from({ length: 60 }, (_, k) => qText(q(k + 1, 60))));
  const part = mk();
  part.runUntil(0.31);
  assert.equal(frameTs(part).at(-1), "3/10"); // 18/60: the grid's last point at or before 0.31; none at 0.31
  assert.equal(qText(part.lastFrame), "3/10");
  for (const cuts of [[0.31, 1], [0.005, 0.5, 0.999, 1], [0.2, 0.2, 1]]) {
    const r = mk();
    for (const t of cuts) r.runUntil(t);
    assert.equal(sig(r), sig(one), `cuts ${cuts}`);
  }
  assert.deepEqual(replay(composed, { runtimes, dev: false }, one.record()).diagnostics, []);
});

test("R1: a tick-only display run logs its frames too, so a driver frame after runUntil counts from the run's T and reports no slowdown", () => {
  const { composed, runtimes } = pair({ prodClock: { tick: 1 / 20 }, consClock: { tick: 1 / 10 }, per: 1, max: 2 });
  const run = createRun(composed, { runtimes, frames: "display", catchUp: 0.1, dev: false });
  const d = createDriver(run);
  d.frame(1 / 60);
  run.runUntil(5);
  d.frame(1 / 60); d.frame(1 / 60);
  assert.deepEqual(run.diagnostics, []);
  assert.ok(run.seconds > 5.03 && run.seconds < 5.04, String(run.seconds));
  assert.deepEqual(run.stats().slowdowns, []);
  assert.deepEqual(replay(composed, { runtimes, dev: false }, run.record()).diagnostics, []);
});

test("a stopped frame part: runUntil still logs frames, so the driver's next frame is not capped from a stale last frame", () => {
  const { mk } = display();
  const run = mk();
  const d = createDriver(run);
  run.runUntil(0.6); // the consumer stops at 1/2
  run.runUntil(5);
  d.frame(1 / 60); d.frame(1 / 60);
  assert.deepEqual(run.diagnostics.map((x) => x.code), ["N004", "N001"]); // the stop, and its dropped records
  assert.match(run.diagnostics[1].message, /is stopped/);
  assert.ok(run.seconds > 5.03 && run.seconds < 5.04, String(run.seconds));
});

test("the driver's window agrees with the run's T when T moved without frames (advance from the log alone): no capped frame, no slowdown", () => {
  const { composed, runtimes } = pair({ prodClock: { tick: 1 / 20 }, consClock: { tick: 1 / 10 }, per: 1, max: 2 });
  const run = createRun(composed, { runtimes, frames: "display", catchUp: 0.1, dev: false });
  const d = createDriver(run);
  run.advance(5);
  assert.equal(d.frame(1 / 60), "5017/1000");
  assert.deepEqual(run.diagnostics, []);
  assert.deepEqual(run.log.inputs.filter((e) => e.capped), []);
  // a frame longer than the cap is still capped, at the cap past T
  assert.equal(d.frame(1), "5117/1000");
  assert.equal(run.log.inputs.at(-1)?.capped?.wall, 1);
});

for (const cuts of [[4], [3, 4], [1.5, 3, 4], [1, 4]]) {
  test(`a frame part restarted during a display runUntil steps on frames at once, within the cap, with no backlog (cuts ${cuts})`, () => {
    const { mk, broken, fixed } = display();
    const run = mk();
    run.runUntil(0.6); // the consumer stops at 1/2
    broken.now = false;
    run.input({ kind: "rebuild", T: 1, part: "b", record: fixed, package: { content: "B" } });
    for (const t of cuts) run.runUntil(t);
    assert.equal(run.builds[0].ok, true);
    assert.deepEqual(run.diagnostics.filter((x) => x.code === "N002"), []);
    assert.equal(run.state("b").Ts[0], 1, "the restarted consumer's first step is at the rebuild's stamp, a frame");
    assert.ok(run.state("b").biggest <= 2, String(run.state("b").biggest));
    assert.ok(frameSpans(run).every((/** @type {any} */ s) => toNumber(s) <= 1 / 60 + 1e-12), "every frame a nominal frame from the one before");
    const ref = mk();
    broken.now = true; ref.runUntil(0.6); broken.now = false;
    ref.input({ kind: "rebuild", T: 1, part: "b", record: fixed, package: { content: "B" } });
    ref.runUntil(4);
    assert.equal(sig(run), sig(ref));
  });
}

test("a frame part whose init failed, fixed mid-chunk on a display run, steps from the fix's stamp in any chunking", () => {
  const { mk, broken, fixed } = display({ initBroken: true });
  /** @param {number[]} cuts */
  const go = (cuts) => {
    broken.now = true;
    const run = mk();
    broken.now = false;
    run.input({ kind: "rebuild", T: 0.5, part: "b", record: fixed, package: { content: "B" } });
    for (const t of cuts) run.runUntil(t);
    return run;
  };
  const one = go([2]);
  assert.deepEqual(one.diagnostics.filter((x) => x.code === "N002"), []);
  assert.equal(one.state("b").Ts[0], 0.5);
  assert.ok(one.state("b").biggest <= 2);
  for (const cuts of [[0.3, 2], [0.5, 2], [0.51, 1.7, 2]]) assert.equal(sig(go(cuts)), sig(one), `cuts ${cuts}`);
});

test("a frame part fixed at T = 0 on a display run steps at the run's frame at T = 0, as a tick part does", () => {
  for (const clock of [{ frame: true }, { tick: 1 / 60 }]) {
    let broken = true;
    const t = tiny("tk", { state: { k: "f64" }, inputs: false, ports: { out: {}, in: {} } },
      { clock: () => clock, init: () => { if (broken) throw new Error("bad init"); return { k: 0 }; }, step: (/** @type {any} */ s) => ({ k: s.k + 1 }) });
    const runtimes = [t.runtime];
    const composed = compose("c").part(/** @type {any} */ (t.grammar("tk"))).build({ runtimes });
    const run = createRun(composed, { runtimes, frames: "display", dev: false, packages: [{ name: "tk", content: "A" }] });
    broken = false;
    const e = run.input({ kind: "rebuild", part: "tk", record: composed.parts[0].record, package: { content: "B" } });
    assert.equal(qText(e.T), "0");
    assert.equal(run.hashes[0]?.T, "0", JSON.stringify(clock));
  }
});

test("after a rewind between frames, runUntil's first frame stays within the cap of the last, even for a cap off the 1/60 grid", async () => {
  const { framesTo, createFrameLog } = await import("../frames.js");
  // last frame 0, T 0.029, cap 0.03: the next grid point (1/30) is past the cap, so the first frame is the cap, and
  // the grid goes on from it
  const out = framesTo(createFrameLog(), q(29, 1000), q(1, 10), q(3, 100));
  assert.deepEqual(out.slice(0, 2).map(qText), ["3/100", "7/150"]);
  // end to end: a driver frame capped at 0.03, a rewind between frames, then runUntil
  const { built, runtimes } = pair({ prodClock: { tick: 1 / 1000 }, consClock: { frame: true }, max: 100000 });
  const run = createRun(built.build({ runtimes, catchUp: 0.03 }), { runtimes, frames: "display", dev: false, catchUp: 0.03 });
  createDriver(run).frame(0.5);
  run.rewind(0.029);
  run.runUntil(0.1);
  for (const s of frameSpans(run)) assert.ok(toNumber(s) <= 0.03 + 1e-12, `a frame spans ${toNumber(s)} s, past the cap`);
  assert.ok(run.state("b").biggest <= 30, "a step took more records than S116 sized for the cap");
});
