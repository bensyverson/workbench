// run.why(part?, since?): the why text from the run's own build events and input log (kit/build/why.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRun, replay } from "../index.js";
import { bursts, rightAt, STEER } from "./helpers.js";
import { why as buildWhy } from "../../build/index.js";

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
  assert.match(text, /\nbuild level@2 after instant T=1\/6 \(0\.167 s\), at T=1\/5 \(0\.2 s\) \(before the next instant\)\n/);
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
    assert.match(text, /^why: 1 rebuild since T=1\/2 \(0\.5 s\)\n/);
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

const LONG2 = ["#########", "#.c.c.cc#", "#########"];

/** A run with two glue rebuilds of `level`, stamped `a` and `b`, run to 0.3 s (fx steps at 0.2 and 7/30). @param {string} a @param {string} b */
function twice(a, b) {
  const { composed, runtimes, M } = bursts();
  const g1 = /** @type {any} */ (M.grammar("level").grid(LONG).control(STEER)).build();
  const g2 = /** @type {any} */ (M.grammar("level").grid(LONG2).control(STEER)).build();
  const run = createRun(composed, { runtimes, inputs: [rightAt(0), { kind: "rebuild", T: a, part: "level", record: g1 }, { kind: "rebuild", T: b, part: "level", record: g2 }] });
  run.runUntil(0.3);
  return { run, composed, runtimes };
}

test("two rebuilds of one part at one stamp: the first says it was superseded, the second names the revision the consumers last read, and each lists its own input", () => {
  const { run } = twice("41/200", "41/200");
  const text = run.why("level");
  const [first, second] = text.split("\nbuild ").slice(1);
  assert.match(first, /consumers: +fx\.in\.burst never read level@2: superseded by level@3 before any consumer step/);
  assert.doesNotMatch(first, /level@2 \(\$rev 2\)/);
  assert.match(second, /consumers: +fx\.in\.burst read level@1 at every step before T=41\/200 \(0\.205 s\), and level@3 \(\$rev 3\) from their first step at or after it/);
  assert.match(first, /inputs: +since the run started: T=0 s level pad right; T=41\/200 \(0\.205 s\) level rebuild$/m);
  assert.match(second, /inputs: +since T=41\/200 \(0\.205 s\): T=41\/200 \(0\.205 s\) level rebuild$/m);
});

test("two rebuilds of one part in one gap between consumer steps never claim a read of the first", () => {
  const { run } = twice("41/200", "21/100");
  const text = run.why("level");
  assert.match(text, /level@2 \(\$rev 2\) at any step from T=41\/200 \(0\.205 s\) until level@3 landed at T=21\/100 \(0\.21 s\)/);
  assert.match(text, /read level@2 at every step from T=41\/200 \(0\.205 s\) until T=21\/100 \(0\.21 s\)/);
});

test("a rebuild stamped off the instant grid says it landed at its stamp, before the next instant", () => {
  const { run } = twice("41/200", "21/100");
  assert.match(run.why("level"), /\nbuild level@2 after instant T=1\/5 \(0\.2 s\), at T=41\/200 \(0\.205 s\) \(before the next instant\)\n/);
  assert.doesNotMatch(run.why("level"), /before instant/);
});

test("with since given, the header counts the rebuilds since it", () => {
  const { run } = rebuilt();
  assert.match(run.why(undefined, "1/2").split("\n")[0], /^why: 1 rebuild since T=1\/2 \(0\.5 s\)$/);
  assert.match(run.why("level", "1/5").split("\n")[0], /^why level: 1 rebuild since T=1\/5 \(0\.2 s\); level@2 now$/);
  assert.match(run.why().split("\n")[0], /^why: 2 rebuilds in the run log$/);
});

test("run.why of a part the composition does not have throws a plain Error naming the parts", () => {
  const { run } = rebuilt();
  assert.throws(() => run.why("nosuch"), (e) => e instanceof Error && e.constructor === Error && /nosuch/.test(e.message) && /level/.test(e.message) && /fx/.test(e.message));
});

test("the text is the same on a replay of the JSON round-tripped record", () => {
  const { run, composed, runtimes } = twice("41/200", "41/200");
  const rec = JSON.parse(JSON.stringify(run.record()));
  const again = replay(composed, { runtimes }, rec);
  assert.equal(again.ok, true);
  assert.equal(again.run.why(), run.why());
  assert.equal(buildWhy(rec.builds, rec.log), run.why());
});
