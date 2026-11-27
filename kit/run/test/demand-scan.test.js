// @ts-nocheck: handles and builder chains are generated, which TypeScript cannot see.
// How a run of demand parts finds its next instant: the next logged input that reaches a running demand part
// (Ben, 2026-11-27, issue qsEYlW). Finding it costs about the same at any length of log, so a replay of a long display
// run with its frames logged ahead is linear in its frames (issue AxQH2A, reviewer-76: it was quadratic), and what it
// finds follows the parts: a demand part that stops is reached by no later input, and a rebuild that restarts it is.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRun, replay } from "../index.js";
import { compose } from "../../compose/index.js";
import { mazeKit, CORRIDOR, STEER, rightAt, tiny } from "./helpers.js";

const DEMAND = { demand: true };
const Ts = (run) => run.hashes.map((h) => h.T);

test("a demand-only display run with its frames logged ahead reads each frame's stamp a bounded number of times", () => {
  const M = mazeKit({ clock: () => DEMAND });
  const composed = compose("solo").part(M.grammar("level").grid(CORRIDOR).control(STEER)).build({ runtimes: [M.runtime] });
  const N = 3000;
  let reads = 0;
  // a frame's stamp as a rational whose every read is counted: the run keeps the object it is given
  const counted = (n, d) => ({ get n() { reads++; return n; }, get d() { reads++; return d; } });
  const frames = Array.from({ length: N }, (_, i) => ({ kind: "frame", T: counted(i + 1, 60) }));
  // the first input makes an instant, so every later stamp is compared with it as the run looks for the next
  const run = createRun(composed, { runtimes: [M.runtime], frames: "display", inputs: [rightAt(0.001), ...frames, rightAt(N / 60 + 1)] });
  reads = 0;
  run.advance(N / 60 + 2);
  assert.deepEqual(Ts(run), ["1/1000", `${N / 60 + 1}`]);
  assert.deepEqual(run.state("level").player, { x: 3, y: 1 });
  // each frame is applied once and looked at about once: a few reads a frame (18 on 2026-11-27), not about N
  assert.ok(reads < 60 * N, `${reads} reads of ${N} frames' stamps (${Math.round(reads / N)} a frame)`);
});


/** A demand part taking one Event input, whose step throws on its third record while its param `ok` is 0; a rebuild to `ok: 1` with a new package key restarts it. */
function fragile() {
  const t = tiny("frag", { state: { k: "f64" }, inputs: false, ports: { out: {}, in: { e: { seam: "Event<{ n: f64 }>" } } } },
    { clock: () => DEMAND, events: { in: { e: 4 } }, init: () => ({ k: 0 }), step: (s, c) => { if (c.params.ok === 0 && s.k >= 2) throw new Error("boom"); return { k: s.k + c.inputs.e.length }; } });
  const runtimes = [t.runtime];
  const composed = compose("f").part(t.grammar("fr").param("ok", { value: 0 })).build({ runtimes });
  const at = (T) => ({ kind: "in", T, part: "fr", name: "e", value: { n: 1 } });
  const fix = { kind: "rebuild", T: 0.45, part: "fr", record: { ...composed.parts[0].record, params: { ok: { value: 1 } } }, package: { content: "sha256-B" } };
  return { composed, runtimes, at, fix, opts: { runtimes, packages: [{ name: "frag", content: "sha256-A" }], dev: false, checkpointEvery: 1 / 100 } };
}

test("an input to a demand part that stopped makes no instant; a rebuild that restarts it does, in any chunking and on a rewind", () => {
  const f = fragile();
  const log = [f.at(0.1), f.at(0.2), f.at(0.3), f.at(0.4), f.fix, f.at(0.5)];
  const oneGo = createRun(f.composed, { ...f.opts, inputs: log });
  oneGo.runUntil(1);
  // it stops at 3/10; the input at 2/5 reaches no running part, and the rebuild at 9/20 restarts it
  assert.deepEqual(Ts(oneGo), ["1/10", "1/5", "3/10", "9/20", "1/2"]);
  assert.ok(oneGo.diagnostics.some((d) => d.code === "N004" && d.T === "3/10"));
  assert.equal(oneGo.state("fr").k, 1);
  for (const cuts of [[0.15, 0.25, 0.35, 0.42, 1], [0.3, 0.42, 0.45, 1], [0.42, 1]]) {
    const chunked = createRun(f.composed, { ...f.opts, inputs: log });
    for (const c of cuts) chunked.runUntil(c);
    assert.deepEqual(chunked.hashes, oneGo.hashes, `cuts ${cuts}`);
  }
  // live: each input added as the run reaches it, and the run then moved past it
  const live = createRun(f.composed, f.opts);
  for (const e of log) { live.input({ ...e }); live.runUntil(e.T); }
  live.runUntil(1);
  assert.deepEqual(live.hashes, oneGo.hashes);
  const before = JSON.stringify(oneGo.hashes);
  oneGo.rewind(0.46);
  assert.deepEqual(Ts(oneGo), ["1/10", "1/5", "3/10", "9/20"]);
  oneGo.input(f.at(0.5));
  oneGo.runUntil(1);
  assert.equal(JSON.stringify(oneGo.hashes), before);
  assert.deepEqual(replay(f.composed, { runtimes: f.runtimes, packages: f.opts.packages, dev: false }, JSON.parse(JSON.stringify(oneGo.record()))).diagnostics, []);
});
