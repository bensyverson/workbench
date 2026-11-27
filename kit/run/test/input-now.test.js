// @ts-nocheck: handles and builder chains are generated, which TypeScript cannot see.
// run.inputNow: an outside input that takes effect at once (issue qgtpNs, reviewer-79). A host's write-back is put in
// force as a logged rebuild, and a display run whose frame part waits on its next frame held every input until that
// frame came, so for a moment the text was new and the record old, and while paused there was no next frame at all.
// inputNow stamps the input at run.T (or the first millisecond after it, when an instant already ran there), applies
// it there, and leaves the run standing at that stamp; a replay, a chunked run and a rewind give the same records.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRun, createDriver, replay } from "../index.js";
import { compose } from "../../compose/index.js";
import { tiny, ticker } from "./helpers.js";

/** A frame part `fp` (its record's param v is 1) beside a 1/8 s ticker, and the record of fp with v = 2. */
function scene() {
  const fp = tiny("fp", { state: { k: "f64" }, inputs: false, ports: { out: {}, in: {} } }, { clock: () => ({ frame: true }), init: () => ({ k: 0 }), step: (s, c) => ({ k: s.k + (c.record.params?.v?.value ?? 1) }) });
  const tk = ticker("tk", { tick: 1 / 8 });
  const runtimes = [fp.runtime, tk.runtime];
  const composed = compose("c").part(fp.grammar("fp").param("v", { value: 1 })).part(tk.part).build({ runtimes });
  const two = compose("c").part(fp.grammar("fp").param("v", { value: 2 })).part(tk.part).build({ runtimes }).parts[0].record;
  return { composed, runtimes, two, opts: { runtimes, frames: "display", dev: false } };
}
/** @param {any} r */
const sig = (r) => JSON.stringify({ hashes: r.hashes, builds: r.builds });
const recordOf = (run, part) => run.composed.parts.find((p) => p.name === part).record;

test("inputNow applies a rebuild at once in a display run waiting on its next frame, and stands at its stamp", () => {
  const { composed, two, opts } = scene();
  const run = createRun(composed, opts);
  const driver = createDriver(run);
  for (let i = 0; i < 3; i++) driver.frame(1 / 60);
  const lastT = run.hashes.at(-1).T;
  assert.equal(run.seconds, 0.05);
  // run.input waits for the next frame: the record in force is still the old one
  const held = createRun(composed, opts);
  const hd = createDriver(held);
  for (let i = 0; i < 3; i++) hd.frame(1 / 60);
  held.input({ kind: "rebuild", part: "fp", record: two });
  assert.notEqual(recordOf(held, "fp"), two, "run.input holds it until the next frame");
  const e = run.inputNow({ kind: "rebuild", part: "fp", record: two });
  assert.equal(recordOf(run, "fp"), two, "in force at once");
  assert.equal(run.builds.length, 1);
  assert.equal(`${e.T.n}/${e.T.d}`, "51/1000", "the first millisecond after the last instant run");
  assert.equal(run.seconds, 0.051, "the run stands at the stamp");
  assert.equal(run.hashes.at(-1).T, lastT, "no instant ran");
  // a second one stands at the same stamp: no instant has run there
  const again = run.inputNow({ kind: "param", part: "fp", name: "v", value: 3 });
  assert.equal(`${again.T.n}/${again.T.d}`, "51/1000");
  assert.equal(run.params("fp").v, 3, "applied at once");
  assert.equal(run.seconds, 0.051);
  // the driver goes on from there: its next frame is after the stamp
  for (let i = 0; i < 4; i++) driver.frame(1 / 60);
  const frames = run.log.inputs.filter((x) => x.kind === "frame").map((x) => x.T);
  assert.ok(frames.every((t) => { const [n, d] = t.split("/"); return Number(n) / Number(d) !== 0.051; }));
  assert.ok(run.seconds > 0.1);
  // a replay of the log, a run of the log in one go and a chunked one give the same records
  assert.deepEqual(replay(composed, { runtimes: opts.runtimes, dev: false }, run.record()).diagnostics, []);
  const oneGo = createRun(composed, { ...opts, inputs: run.log.inputs });
  oneGo.advance(run.T);
  assert.equal(sig(oneGo), sig(run));
  const chunked = createRun(composed, { ...opts, inputs: run.log.inputs });
  for (const t of [0.02, 0.05, 0.051, 0.06, run.T]) chunked.advance(t);
  assert.equal(sig(chunked), sig(run));
  // a rewind to the stamp stands where a run of the log to the stamp does: the rebuild in force (a rewind drops the
  // frames after it, so it is compared with the log cut there)
  const cut = createRun(composed, { ...opts, inputs: run.log.inputs.filter((x) => x.kind !== "frame" || Number(x.T.split("/")[0]) / Number(x.T.split("/")[1] ?? 1) <= 0.051) });
  cut.advance(0.051);
  run.rewind(0.051);
  assert.equal(recordOf(run, "fp"), two, "the rewind puts the rebuild in force again at its stamp");
  assert.equal(run.params("fp").v, 3);
  assert.equal(sig(run), sig(cut));
});

test("inputNow while no instant has run at run.T stamps it at run.T; one at or before the last instant cannot be made", () => {
  const { composed, two, opts } = scene();
  const run = createRun(composed, { ...opts, frames: "nominal" });
  run.runUntil(0.3);
  // 0.3 is no instant of a 1/8 s ticker nor of the 1/60 grid's last before it (0.3 = 18/60 is one): stand off-grid
  run.runUntil(0.305);
  assert.notEqual(run.hashes.at(-1).T, "61/200");
  const e = run.inputNow({ kind: "rebuild", part: "fp", record: two });
  assert.equal(`${e.T.n}/${e.T.d}`, "61/200");
  assert.equal(recordOf(run, "fp"), two);
  assert.throws(() => run.inputNow({ kind: "rebuild", part: "fp", record: two, T: 0.1 }), /inputNow stamps the input itself/);
  assert.throws(() => run.inputNow({ kind: "rebuild", part: "nope", record: two }), /N009|no part/);
});
