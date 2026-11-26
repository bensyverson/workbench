// The double descent fixed with a param wire (leaf YV7ZNG): the game's depth wired into the cave's depth param, in
// place of the host's bridge. kit/run applies it between instants, so the cave rebuilds before the game's next tick
// and the game goes down one level, however the host chunks the run.
import { test } from "node:test";
import assert from "node:assert/strict";
import { replay } from "../../../kit/run/index.js";
import { inputs } from "../scenario/session.js";
import { runtimes, buildPart } from "../scenario/host.js";
import { wiredGlue, buildWired, playWired } from "../scenario/wired.js";
import { caveProgram, gameProgram } from "../scenario/glue.js";

const session = (/** @type {{ n: number, d: number }} */ chunk) => playWired({ inputs: inputs(), actions: [{ T: 1, slider: "roughness", value: 46 }], chunk, until: 1.5 });

test("with a param wire and the host advancing 1/10 s at a time, the game goes down one level, not three", () => {
  const run = session({ n: 1, d: 10 });
  assert.equal(/** @type {any} */ (run.state("game")).depth, 1);
  const depth = run.builds.filter((/** @type {any} */ b) => b.trigger.kind === "param" && b.trigger.param === "depth");
  assert.deepEqual(depth.map((/** @type {any} */ b) => [b.trigger.from, b.trigger.to, b.changed]), [[0, 1, true]]);
  const set = run.log.inputs.filter((/** @type {any} */ e) => e.kind === "param" && e.name === "depth");
  assert.deepEqual(set.map((/** @type {any} */ e) => [e.value, e.wire]), [[1, "game.out.depth"]]);
});

test("the depth is the same whatever the host's chunk", () => {
  for (const chunk of [{ n: 1, d: 30 }, { n: 1, d: 4 }, { n: 1, d: 10 }]) assert.equal(/** @type {any} */ (session(chunk).state("game")).depth, 1, `chunk ${chunk.n}/${chunk.d}`);
});

test("a replay of the JSON round-tripped record matches", () => {
  const run = session({ n: 1, d: 10 });
  const r = replay(buildWired(), { runtimes, build: buildPart }, JSON.parse(JSON.stringify(run.record())));
  assert.equal(r.ok, true, JSON.stringify(r.diagnostics));
  assert.deepEqual(r.run.log.inputs, run.log.inputs);
});

test("the composition warns that the game ticks (S118), and the why text names the wire", () => {
  const ds = wiredGlue(caveProgram({ seed: 7, depth: 0, roughness: 45 }), gameProgram({})).check({ runtimes });
  assert.deepEqual(ds.map((d) => [d.code, d.severity]), [["S118", "warning"]]);
  const text = session({ n: 1, d: 10 }).why("cave");
  assert.match(text, /param cave\.\$\.depth changed 0 → 1, set by the wire game\.out\.depth → cave\.param\.depth, in a param input stamped T=4\/15/);
  assert.match(text, /cave\.\$\.depth = 1 \(wire game\.out\.depth\)/);
});
