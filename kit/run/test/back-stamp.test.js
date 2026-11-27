// @ts-nocheck: handles and builder chains are generated, which TypeScript cannot see.
// An input stamped behind the time the run has reached (run.T) but after its last instant is accepted and makes the
// instants a run of the same log in one go makes: in a demand-only run the instant at its stamp, and after a restart
// the restarted part's. Those instants run while run.T stands later, and what a checkpoint holds of them is what the
// one-go run holds, so a rewind and a replay of the log stand where the one-go run stands (issue P3fj7k, reviewer-76).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRun } from "../index.js";
import { compose } from "../../compose/index.js";
import { mazeKit, CORRIDOR, STEER, rightAt, tiny } from "./helpers.js";

const DEMAND = { demand: true };
const Ts = (run) => run.hashes.map((h) => h.T);
const pad = { up: false, down: false, left: false, right: true };

function game() {
  const M = mazeKit({ clock: () => DEMAND });
  const composed = compose("solo").part(M.grammar("level").grid(CORRIDOR).control(STEER)).build({ runtimes: [M.runtime] });
  return { composed, runtimes: [M.runtime] };
}

test("a demand-only run: an input stamped behind run.T makes its instant, and a rewind stands where a run of the log in one go does", () => {
  const g = game();
  const live = createRun(g.composed, { runtimes: g.runtimes });
  live.runUntil(2);
  live.input(rightAt(0.5));
  assert.deepEqual(Ts(live), ["1/2"]);
  assert.equal(live.seconds, 2, "the input does not move the run back");
  const oneGo = createRun(g.composed, { runtimes: g.runtimes, inputs: [rightAt(0.5)] });
  oneGo.runUntil(2);
  live.rewind(1);
  oneGo.rewind(1);
  assert.equal(oneGo.seconds, 1);
  assert.equal(live.seconds, 1);
  // the next unstamped input is stamped the same in both
  const a = live.input({ kind: "in", part: "level", name: "pad", value: pad });
  const b = oneGo.input({ kind: "in", part: "level", name: "pad", value: pad });
  assert.deepEqual(a.T, b.T);
  assert.deepEqual(Ts(live), Ts(oneGo));
  assert.equal(JSON.stringify(live.record()), JSON.stringify(oneGo.record()));
});

test("a clocked run: a restart stamped behind run.T runs the restarted part's instants, and a rewind stands where the one-go run does", () => {
  const t = tiny("tk", { state: { k: "f64" }, inputs: false, ports: { out: {}, in: {} } },
    { clock: () => ({ tick: 1 / 4 }), init: () => ({ k: 0 }), step: (s) => { if (s.k >= 3) throw new Error("boom"); return { k: s.k + 1 }; } });
  const runtimes = [t.runtime];
  const composed = compose("c").part(t.grammar("tk")).build({ runtimes });
  const restart = { kind: "rebuild", T: 2, part: "tk", record: composed.parts[0].record, package: { content: "sha256-B" } };
  const opts = { runtimes, packages: [{ name: "tk", content: "sha256-A" }], dev: false };
  const live = createRun(composed, opts);
  live.runUntil(3);
  live.input({ ...restart });
  assert.deepEqual(Ts(live), ["0", "1/4", "1/2", "3/4", "2", "9/4", "5/2", "11/4"]);
  const oneGo = createRun(composed, { ...opts, inputs: [restart] });
  oneGo.runUntil(3);
  live.rewind(2.1);
  oneGo.rewind(2.1);
  assert.equal(oneGo.seconds, 2.1);
  assert.equal(live.seconds, 2.1);
  assert.equal(JSON.stringify(live.record()), JSON.stringify(oneGo.record()));
});
