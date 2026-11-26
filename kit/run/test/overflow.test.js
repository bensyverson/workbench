// An overflow policy on a wire (Ben's ruling 7, 2026-11-26): S116 is an error without one and a warning naming the
// policy with one; at run time a step takes at most the consumer's max, dropping by the policy, counted in
// stats().overflow and noted once per wire (again after a rebuild restarts the consumer), and the run replays.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRun, replay, RunError } from "../index.js";
import { pair } from "./helpers.js";

/** prod pushes 3 numbered records every 1/4 s; cons steps every 1/2 s and takes at most 2: a bound of 6. */
const tight = (/** @type {any} */ wire) => pair({ prodClock: { tick: 1 / 4 }, consClock: { tick: 1 / 2 }, per: 3, max: 2, wire });

test("without a policy S116 is an error: compose refuses, its fix offering the policy", () => {
  assert.throws(() => tight(undefined), (/** @type {any} */ e) => {
    assert.deepEqual(e.diagnostics.map((/** @type {any} */ d) => [d.code, d.severity]), [["S116", "error"]]);
    assert.match(e.diagnostics[0].fix, /overflow: "keepLast"/);
    return true;
  });
});

test("with a policy S116 is a warning naming it, and the composition builds", () => {
  for (const overflow of ["keepLast", "keepFirst"]) {
    const { built, runtimes } = tight({ overflow });
    const ds = built.check({ runtimes });
    assert.deepEqual(ds.map((d) => [d.code, d.severity]), [["S116", "warning"]]);
    assert.match(ds[0].message, new RegExp(`overflow: "${overflow}"`));
    assert.equal(built.build({ runtimes }).wires[0].overflow, overflow);
  }
});

test("a policy that is neither keepLast nor keepFirst is S102", () => {
  assert.throws(() => tight({ overflow: "newest" }), /S102.*overflow is "keepLast"/s);
});

test("keepLast: each step takes the newest records up to the max; the drops are counted and noted once", () => {
  const { composed, runtimes } = tight({ overflow: "keepLast" });
  const run = createRun(composed, { runtimes });
  run.runUntil(1);
  // steps at 0 (records 0-2), 1/2 (3-8), 1 (9-14)
  assert.deepEqual(run.state("b").got, [1, 2, 7, 8, 13, 14]);
  assert.equal(run.state("b").biggest, 2, "the consumer's max never changes");
  assert.deepEqual(run.stats().overflow, { "a.out.e → b.in.e": 9 });
  const notes = run.diagnostics.filter((d) => d.code === "N001");
  assert.equal(notes.length, 1);
  assert.equal(notes[0].severity, "warning");
  assert.match(notes[0].message, /keepLast/);
  assert.equal(replay(composed, { runtimes }, JSON.parse(JSON.stringify(run.record()))).ok, true);
});

test("keepFirst: each step takes the first records up to the max, and the rest are dropped", () => {
  const { composed, runtimes } = tight({ overflow: "keepFirst" });
  const run = createRun(composed, { runtimes });
  run.runUntil(1);
  assert.deepEqual(run.state("b").got, [0, 1, 3, 4, 9, 10]);
  assert.deepEqual(run.stats().overflow, { "a.out.e → b.in.e": 9 });
  assert.equal(run.diagnostics.filter((d) => d.code === "N001").length, 1);
});

test("a policy run is the same chunked as in one go, and after a rewind", () => {
  const { composed, runtimes } = tight({ overflow: "keepLast" });
  const one = createRun(composed, { runtimes });
  one.runUntil(3);
  const chunked = createRun(composed, { runtimes });
  for (const t of [0.3, 1.1, 2, 3]) chunked.runUntil(t);
  assert.deepEqual(chunked.hashes, one.hashes);
  chunked.rewind(1);
  chunked.runUntil(3);
  assert.deepEqual(chunked.hashes, one.hashes);
  assert.deepEqual(chunked.stats().overflow, one.stats().overflow);
});

test("the run refuses an overflowing wire with no policy (RunError S116), as compose does", () => {
  const { composed, runtimes } = tight({ overflow: "keepLast" });
  const bare = { ...composed, wires: composed.wires.map(({ overflow: _, ...w }) => w) };
  assert.throws(() => createRun(bare, { runtimes }), (e) => e instanceof RunError && /S116/.test(e.message));
});
