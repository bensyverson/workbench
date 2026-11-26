// The double-descent scenario on the real kit/compose and kit/run: the trial's packet rests on these facts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { replay } from "../../../kit/run/index.js";
import { session } from "../scenario/session.js";
import { buildComposition, buildPart, runtimes } from "../scenario/host.js";
import { why } from "../why.js";

test("the session descends three levels from one stand on the exit: the host forwards depth once per 1/10 s chunk", () => {
  const run = session();
  assert.equal(/** @type {any} */ (run.state("game")).depth, 3);
  const [deep, rough, save] = /** @type {any[]} */ (run.builds);
  assert.deepEqual([deep.trigger.param, deep.trigger.from, deep.trigger.to, deep.changed], ["depth", 0, 3, true]);
  assert.deepEqual(deep.record, ["exit", "grid", "start"]);
  // a param's value is not in the content key (ruled 2026-11-26, x3iG6D): roughness 45 → 46 carves the same cave,
  // so the rebuild keeps cave@2 (before the ruling it bumped to cave@3 with only record.params changed)
  assert.deepEqual([rough.trigger.param, rough.changed, rough.record, rough.revision], ["roughness", false, [], { before: 2, after: 2 }]);
  assert.deepEqual([save.trigger.kind, save.changed, save.revision], ["glue", false, { before: 2, after: 2 }]);
  assert.equal(replay(buildComposition(), { runtimes, build: buildPart }, run.record()).ok, true);
});

test("a host that forwards depth after every game tick descends one level", () => {
  const run = session({ chunk: { n: 1, d: 30 } });
  assert.equal(/** @type {any} */ (run.state("game")).depth, 1);
});

test("the why text of the session names the jump, the no-op and the consumers", () => {
  const run = session();
  const text = why(/** @type {any} */ (run.builds), run.log);
  assert.match(text, /param cave\.\$\.depth changed 0 → 3, set by a param input stamped T=1\/3/);
  assert.match(text, /rebuilt, nothing changed; revision kept/);
  assert.match(text, /game\.in\.start, game\.in\.exit read cave@1 at every step before T=1\/3 \(0\.333 s\), and cave@2/);
});
