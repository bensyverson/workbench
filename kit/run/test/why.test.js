// run.why(part?, since?): the why text from the run's own build events and input log (kit/build/why.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRun, replay } from "../index.js";
import { bursts, rightAt, STEER } from "./helpers.js";

const LONG = ["#########", "#..cc.cc#", "#########"];

/** A run with one glue edit of `level` at 0.2 s and a no-op rebuild of `fx` at 0.6 s, run to 1 s. */
function rebuilt() {
  const { composed, runtimes, M } = bursts();
  const next = /** @type {any} */ (M.grammar("level").grid(LONG).control(STEER)).build();
  const same = structuredClone(composed.parts[1].record);
  const inputs = [rightAt(0), { kind: "rebuild", T: 0.2, part: "level", record: next, trigger: { kind: "glue", call: "level.grid" } }, { kind: "rebuild", T: 0.6, part: "fx", record: same }];
  const run = createRun(composed, { runtimes, inputs });
  run.runUntil(1);
  return { run, composed, runtimes };
}

test("run.why(part) is the text of that part's builds, from the run's own events and log", () => {
  const { run } = rebuilt();
  const text = run.why("level");
  assert.equal(text.split("\n")[0], "why level: 1 rebuild in the run log; level@2 now");
  assert.match(text, /\nbuild level@2 after instant T=1\/6 \(0\.167 s\), before instant T=1\/5 \(0\.2 s\)\n/);
  assert.match(text, /because: +glue edit of level\.grid/);
  assert.match(text, /inputs: +since the run started: T=0 s level pad right; /);
  assert.doesNotMatch(text, /build fx/);
});

test("run.why() covers every part; a part never rebuilt says so", () => {
  const { run } = rebuilt();
  const all = run.why();
  assert.match(all, /^why: 2 rebuilds in the run log\n/);
  assert.match(all, /build level@2 /);
  assert.match(all, /build fx@1 .*: rebuilt, nothing changed; revision kept/);
  const { composed, runtimes } = bursts();
  assert.equal(createRun(composed, { runtimes }).why("level"), "why level: no rebuilds in the run log; level@1 since the run started");
});

test("run.why(part, since) takes seconds or a rational, and keeps the builds whose boundary is at or after it", () => {
  const { run } = rebuilt();
  for (const since of [0.5, "1/2"]) {
    const text = run.why(undefined, since);
    assert.match(text, /^why: 1 rebuild in the run log\n/);
    assert.match(text, /build fx@1 /);
    assert.doesNotMatch(text, /build level@2 /);
  }
  assert.match(run.why("level", "1/5"), /build level@2 /);
});

test("a replay of the record gives the same text", () => {
  const { run, composed, runtimes } = rebuilt();
  const again = replay(composed, { runtimes }, run.record());
  assert.equal(again.ok, true);
  assert.equal(again.run.why(), run.why());
});
