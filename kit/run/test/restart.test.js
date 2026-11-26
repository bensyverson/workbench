// Restarts and the run's place between instants: a rebuild that restarts a stopped part (or fixes a failed init)
// while no other part makes instants gives the same run however runUntil is chunked, and no instant runs ahead of an
// input already applied; a replay applies the inputs a run applied after its last instant; a stopped part takes no
// Events (Ben, 2026-11-26): records sent to it are dropped and counted, and a restart begins with empty queues.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRun, replay } from "../index.js";
import { compose } from "../../compose/index.js";
import { bursts, rightAt, tiny, pair } from "./helpers.js";

/** One tick part (1/4 s) whose step throws once k reaches 3: it stops at T = 3/4, and then no part is due. */
function lonely() {
  const t = tiny("tk", { state: { k: "f64" }, inputs: false, ports: { out: {}, in: {} } },
    { clock: () => ({ tick: 1 / 4 }), init: () => ({ k: 0 }), step: (/** @type {any} */ s) => { if (s.k >= 3) throw new Error("boom"); return { k: s.k + 1 }; } });
  const runtimes = [t.runtime];
  const composed = compose("c").part(/** @type {any} */ (t.grammar("tk"))).build({ runtimes });
  // at T = 2 the host swaps the package (the same record, a new package key): init reruns, and the part restarts
  const restart = { kind: "rebuild", T: 2, part: "tk", record: composed.parts[0].record, package: { content: "sha256-B" } };
  const opts = { runtimes, packages: [{ name: "tk", content: "sha256-A" }], dev: false };
  return { composed, runtimes, restart, opts };
}

/** @param {any} r */
const sig = (r) => JSON.stringify({ hashes: r.hashes, builds: r.builds });

test("a restart while no part is due: one go, any chunking and a live input give the same instants, counted from the stamp", () => {
  const { composed, restart, opts } = lonely();
  const oneGo = createRun(composed, { ...opts, inputs: [restart] });
  oneGo.runUntil(3);
  // the restarted part's clock counts from the rebuild's stamp: its first instant is the first multiple at or after 2
  assert.deepEqual(oneGo.hashes.map((h) => h.T), ["0", "1/4", "1/2", "3/4", "2", "9/4", "5/2", "11/4"]);
  assert.deepEqual(oneGo.builds[0].boundary, { after: "3/4", before: "2" });
  assert.equal(oneGo.snapshot("tk").revision, 2);
  for (const cuts of [[2, 3], [1, 2, 2.1, 3], [2.5, 3], [1.999, 2.001, 3], [0.75, 3]]) {
    const chunked = createRun(composed, { ...opts, inputs: [restart] });
    for (const t of cuts) chunked.runUntil(t);
    assert.equal(sig(chunked), sig(oneGo), `cuts ${cuts}`);
  }
  // the host adds the rebuild live, while the run stands at 2
  const live = createRun(composed, opts);
  live.runUntil(2);
  live.input({ ...restart });
  live.runUntil(3);
  assert.equal(sig(live), sig(oneGo));
  const rp = replay(composed, { runtimes: opts.runtimes, packages: opts.packages, dev: false }, live.record());
  assert.deepEqual(rp.diagnostics, []);
});

test("a fixed init while every other part is demand: the restarted part's instants start at the rebuild's stamp in any chunking", () => {
  let broken = true;
  const t = tiny("tk", { state: { k: "f64" }, inputs: false, ports: { out: {}, in: {} } },
    { clock: () => ({ tick: 1 / 4 }), init: () => { if (broken) throw new Error("bad init"); return { k: 0 }; }, step: (/** @type {any} */ s) => ({ k: s.k + 1 }) });
  const d = tiny("dm", { state: { k: "f64" }, inputs: false, ports: { out: {}, in: {} } }, { clock: () => ({ demand: true }), init: () => ({ k: 0 }), step: (/** @type {any} */ s) => ({ k: s.k + 1 }) });
  const runtimes = [t.runtime, d.runtime];
  const composed = compose("c").part(/** @type {any} */ (t.grammar("tk"))).part(/** @type {any} */ (d.grammar("dm"))).build({ runtimes });
  const fix = { kind: "rebuild", T: 1.1, part: "tk", record: composed.parts[0].record, package: { content: "sha256-B" } };
  const opts = { runtimes, packages: [{ name: "tk", content: "sha256-A" }], dev: false };
  broken = true;
  const first = createRun(composed, { ...opts, inputs: [fix] });
  assert.equal(first.state("tk"), null);
  broken = false;
  first.runUntil(2);
  assert.deepEqual(first.hashes.map((h) => h.T), ["5/4", "3/2", "7/4", "2"]);
  assert.equal(first.state("tk").k, 4);
  for (const cuts of [[1, 2], [1.1, 1.2, 2], [1.5, 2]]) {
    broken = true;
    const chunked = createRun(composed, { ...opts, inputs: [fix] });
    broken = false;
    for (const c of cuts) chunked.runUntil(c);
    assert.equal(sig(chunked), sig(first), `cuts ${cuts}`);
  }
});

test("step() applies the inputs stamped while no part is due, and runs the restarted part's first instant", () => {
  const { composed, restart, opts } = lonely();
  const run = createRun(composed, { ...opts, inputs: [restart] });
  for (let i = 0; i < 4; i++) run.step();
  assert.equal(run.step()?.T, "2");
  assert.equal(run.snapshot("tk").revision, 2);
});

test("replay applies the inputs a run applied after its last instant: a rebuild in runUntil's tail replays clean", () => {
  const { composed, runtimes } = bursts();
  const same = structuredClone(composed.parts[0].record);
  const packages = [{ name: "maze", content: "sha256-A" }];
  const run = createRun(composed, { runtimes, packages, inputs: [rightAt(0)] });
  run.runUntil(1.04);
  run.input({ kind: "rebuild", T: 1.045, part: "level", record: same, package: { content: "sha256-B" } });
  run.runUntil(1.05);
  assert.equal(run.builds.length, 1);
  assert.equal(run.record().T, "21/20");
  const r = replay(composed, { runtimes, packages }, run.record());
  assert.deepEqual(r.diagnostics, []);
  assert.equal(r.run.builds.length, 1);
  // and the run goes on from there as the replay does
  run.runUntil(2);
  const r2 = replay(composed, { runtimes, packages }, run.record());
  assert.deepEqual(r2.diagnostics, []);
});

test("an input stamped at or before the run's T applies at once, as runUntil(T) would, and a replay agrees", () => {
  const { composed, runtimes } = bursts();
  const same = structuredClone(composed.parts[0].record);
  const packages = [{ name: "maze", content: "sha256-A" }];
  const run = createRun(composed, { runtimes, packages, inputs: [rightAt(0)] });
  run.runUntil(1.05);
  run.input({ kind: "rebuild", T: 1.045, part: "level", record: same, package: { content: "sha256-B" } });
  assert.equal(run.builds.length, 1);
  assert.equal(run.builds[0].boundary.before, "16/15");
  assert.deepEqual(replay(composed, { runtimes, packages }, run.record()).diagnostics, []);
});

/** A consumer whose step throws from T = 1/2 while `broken.now`; producer and consumer tick every 1/8. */
function backlog() {
  const broken = { now: true };
  const { composed, runtimes } = pair({
    prodClock: { tick: 1 / 8 }, consClock: { tick: 1 / 8 }, per: 1, max: 1,
    consStep: (/** @type {any} */ s, /** @type {any} */ c) => { if (broken.now && c.T >= 0.5) throw new Error("bug"); return { got: [...s.got, ...c.inputs.e.map((/** @type {any} */ r) => r.n)], Ts: s.Ts, biggest: Math.max(s.biggest, c.inputs.e.length) }; },
  });
  return { composed, runtimes, broken, packages: [{ name: "cons", content: "sha256-A" }] };
}

test("a stopped part takes no Events: records sent to it are dropped and counted, and a restart begins with empty queues", () => {
  const { composed, runtimes, broken, packages } = backlog();
  const run = createRun(composed, { runtimes, dev: false, packages });
  run.runUntil(1);
  assert.deepEqual(run.diagnostics.filter((d) => d.severity === "error").map((d) => `${d.code}@${d.T}`), ["N004@1/2"]);
  broken.now = false; // the host fixed the package's step; the rebuild carries the new package key
  run.input({ kind: "rebuild", part: "b", record: composed.parts[1].record, package: { content: "sha256-B" } });
  run.runUntil(2);
  assert.equal(run.builds[0].ok, true);
  assert.equal(run.snapshot("b").revision, 2);
  // the record pushed at 1/2 went to the step that threw; the four pushed while b was stopped are gone; b takes from 9/8 on
  assert.deepEqual(run.state("b").got, [9, 10, 11, 12, 13, 14, 15, 16]);
  assert.deepEqual(run.diagnostics.filter((d) => d.code === "N002"), []);
  assert.deepEqual(run.stats().stopped, { "a.out.e → b.in.e": 4 });
  assert.deepEqual(run.stats().dropped, {});
  const n001 = run.diagnostics.filter((d) => d.code === "N001");
  assert.equal(n001.length, 1);
  assert.equal(n001[0].severity, "warning");
  assert.equal(n001[0].part, "b");
  assert.equal(n001[0].T, "5/8");
  assert.match(n001[0].message, /a\.out\.e → b\.in\.e: b is stopped, so it takes no Events: 1 record was dropped here; stats\(\)\.stopped counts every one/);
  // a rewind past the stop restores the counts as they stood (it replays with the step broken, as it was then)
  broken.now = true;
  run.rewind(0.75);
  assert.deepEqual(run.stats().stopped, { "a.out.e → b.in.e": 2 });
  broken.now = false;
  run.input({ kind: "rebuild", T: 9 / 8, part: "b", record: composed.parts[1].record, package: { content: "sha256-B" } });
  run.runUntil(2);
  assert.deepEqual(run.stats().stopped, { "a.out.e → b.in.e": 4 });
  assert.deepEqual(run.state("b").got, [9, 10, 11, 12, 13, 14, 15, 16]);
});

test("a part whose init failed takes no Events either: its records are dropped and counted", () => {
  const { composed, runtimes } = pair({ prodClock: { tick: 1 / 8 }, consClock: { tick: 1 / 8 }, per: 1, max: 1 });
  const bad = { ...runtimes[1], init: () => { throw new Error("bad init"); } };
  const run = createRun(composed, { runtimes: [runtimes[0], bad], dev: false });
  run.runUntil(1);
  assert.deepEqual(run.stats().stopped, { "a.out.e → b.in.e": 9 });
});
