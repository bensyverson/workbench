// Rebuilds in a run (the build record draft, ruled 2026-11-26): a rebuild lands between instants; the part's revision
// bumps only when its content key changes; consumers see it in inputs.$rev; each rebuild writes a build event to the
// run log; replay reproduces rebuilds exactly.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRun, replay } from "../index.js";
import { partKey, compositionKey } from "../../build/index.js";
import { run as runProgram, KIT_VERSION } from "../../define/index.js";
import { compose } from "../../compose/index.js";
import { bursts, mazeKit, fxKit, rightAt, CORRIDOR, STEER, tiny } from "./helpers.js";

const LONG = ["#########", "#..cc.cc#", "#########"];

test("each part starts at revision 1 with its content key; the composition at revision 1", () => {
  const { composed, runtimes } = bursts();
  const run = createRun(composed, { runtimes, packages: [{ name: "maze", content: "sha256-M" }] });
  assert.equal(run.snapshot("level").revision, 1);
  assert.equal(run.revision, 1);
  assert.equal(run.key("level"), partKey({ package: "sha256-M", record: composed.parts[0].record }));
  assert.equal(run.key("fx"), partKey({ package: null, record: composed.parts[1].record }));
  assert.equal(run.compositionKey, compositionKey({ level: run.key("level"), fx: run.key("fx") }, composed.wires, composed.show));
});

test("a rebuild with a new record lands between instants, bumps the revision, reruns init, and keeps the queues", () => {
  const { composed, runtimes, M } = bursts({ fx: fxKit({ clock: { tick: 1 / 4 }, max: 16 }) });
  const next = /** @type {any} */ (M.grammar("level").grid(LONG).control(STEER)).build();
  const run = createRun(composed, { runtimes, inputs: [rightAt(0), { kind: "rebuild", T: 0.2, part: "level", record: next, trigger: { kind: "glue", call: "level.grid" } }] });
  run.runUntil(1);
  const [e] = run.builds;
  assert.equal(e.part, "level");
  assert.deepEqual(e.boundary, { after: "1/8", before: "1/5" }); // at its own stamp (ruling R2)
  assert.deepEqual(e.revision, { before: 1, after: 2 });
  assert.equal(e.changed, true);
  assert.deepEqual(e.record, ["grid"]);
  assert.deepEqual(e.kernels, { changed: [], added: [], removed: [], unchanged: ["level.control"] });
  assert.deepEqual(e.consumers, ["fx.in.burst"]);
  assert.deepEqual(e.trigger, { kind: "glue", call: "level.grid" });
  assert.equal(run.snapshot("level").revision, 2);
  assert.equal(run.revision, 2);
  // init ran again on the new grid: the player restarted at (1, 1) and picked all four coins
  assert.equal(run.state("level").grid[1], "#.......#");
  // the pick at 1/8 (revision 1) stayed queued across the rebuild and reached fx at 1/4; $rev is the revision of
  // the producer's snapshot the step read
  assert.deepEqual(run.state("fx").seen.map((/** @type {any} */ s) => [s.T, s.x, s.rev]), [[0.25, 35, 2], [0.5, 35, 2], [0.5, 45, 2], [0.75, 65, 2], [1, 75, 2]]);
});

test("a rebuild whose content key is unchanged keeps the revision and says so", () => {
  const { composed, runtimes } = bursts();
  const same = structuredClone(composed.parts[0].record);
  const run = createRun(composed, { runtimes, inputs: [{ kind: "rebuild", T: 0.1, part: "level", record: same }] });
  run.runUntil(0.5);
  assert.equal(run.builds.length, 1);
  assert.equal(run.builds[0].changed, false);
  assert.deepEqual(run.builds[0].revision, { before: 1, after: 1 });
  assert.deepEqual(run.builds[0].trigger, { kind: "glue", call: null });
  assert.equal(run.snapshot("level").revision, 1);
  assert.ok(run.state("level").t > 0.4, "init did not run again");
});

test("a rebuild with a new package key and the same record: the key changes, so the revision bumps; the trigger names the package", () => {
  const { composed, runtimes } = bursts();
  const run = createRun(composed, { runtimes, packages: [{ name: "maze", content: "sha256-A" }], inputs: [{ kind: "rebuild", T: 0.1, part: "level", record: composed.parts[0].record, package: { content: "sha256-B" } }] });
  run.runUntil(0.5);
  assert.deepEqual(run.builds[0].trigger, { kind: "package", from: "sha256-A", to: "sha256-B", files: [] });
  assert.equal(run.builds[0].changed, true);
  assert.deepEqual(run.builds[0].record, []);
  assert.equal(run.key("level"), partKey({ package: "sha256-B", record: composed.parts[0].record }));
  assert.equal(run.snapshot("level").revision, 2);
});

test("a rebuild that fails keeps the previous revision running, and the event carries the diagnostics", () => {
  const { composed, runtimes } = bursts();
  const broken = { ...structuredClone(composed.parts[0].record), control: "(pl, pad) => { pl.nope = 1; }" };
  const run = createRun(composed, { runtimes, inputs: [{ kind: "rebuild", T: 0.1, part: "level", record: broken }] });
  run.runUntil(0.5);
  assert.equal(run.builds[0].ok, false);
  assert.ok(run.builds[0].diagnostics.length > 0);
  assert.equal(run.snapshot("level").revision, 1);
  assert.ok(run.state("level").t > 0.4);
});

test("a param read at build time rebuilds through the host's build function; the trigger names the read", () => {
  const M = mazeKit(), F = fxKit();
  const program = (/** @type {any} */ $) => /** @type {any} */ (M.grammar("level").param("long", { value: 0 }).grid($.long ? LONG : CORRIDOR).control(STEER));
  const built = /** @type {Record<string, any>} */ (runProgram(program).record);
  // a host rebuilds a part by running its Program with the new params
  const build = (/** @type {string} */ part, /** @type {Record<string, unknown>} */ params) => { assert.equal(part, "level"); return /** @type {Record<string, any>} */ (runProgram(program, { values: params }).record); };
  const { composed, runtimes } = bursts({ maze: M, fx: F });
  const rec = { ...composed, parts: composed.parts.map((p) => (p.name === "level" ? { ...p, record: built } : p)) };
  const run = createRun(rec, { runtimes, build, inputs: [{ kind: "param", T: 0.3, part: "level", name: "long", value: 1 }] });
  run.runUntil(0.5);
  assert.equal(run.builds.length, 1);
  const t = /** @type {any} */ (run.builds[0].trigger);
  assert.equal(t.kind, "param");
  assert.deepEqual([t.param, t.from, t.to], ["long", 0, 1]);
  assert.equal(t.reads.length, 1);
  assert.equal(run.snapshot("level").revision, 2);
  assert.equal(run.state("level").grid[1], LONG[1]);
});

test("a live param (read only by Kernels) changes no key and rebuilds nothing; the next step's $ has it", () => {
  /** @type {unknown[]} */
  const seen = [];
  const M = mazeKit({ step: (/** @type {any} */ s, /** @type {any} */ c) => { seen.push(c.params.speed); return s; } });
  const { composed, runtimes } = bursts({ maze: M });
  const rec = { ...composed, parts: composed.parts.map((p) => (p.name === "level" ? { ...p, record: { ...p.record, params: { speed: { value: 1 } } } } : p)) };
  const run = createRun(rec, { runtimes, dev: false, inputs: [{ kind: "param", T: 0.2, part: "level", name: "speed", value: 3 }] });
  run.runUntil(0.5);
  assert.deepEqual(seen, [1, 1, 3, 3, 3]);
  assert.equal(run.builds.length, 0);
});

test("replay reproduces rebuilds, and so revisions and build events, exactly", () => {
  const { composed, runtimes, M } = bursts();
  const next = /** @type {any} */ (M.grammar("level").grid(LONG).control(STEER)).build();
  const run = createRun(composed, { runtimes, inputs: [rightAt(0), { kind: "rebuild", T: 0.6, part: "level", record: next }] });
  run.runUntil(1.5);
  const r = replay(composed, { runtimes }, run.record());
  assert.equal(r.ok, true);
  assert.deepEqual(r.run.builds, run.builds);
  assert.equal(KIT_VERSION.length > 0, true);
});

/** A one-part workbench whose clock is its record's: size 5 ticks every 1/5 s, anything else every 1/4 s; size 13's init throws. */
function clocked() {
  const P = tiny("prod", { state: { k: "f64" }, ports: { out: { v: { seam: "f64", from: "k" } } } },
    { clock: (/** @type {any} */ r) => ({ tick: r.size === 5 ? 1 / 5 : 1 / 4 }), init: (/** @type {any} */ r) => { if (r.size === 13) throw new Error("13 is unlucky"); return { k: 0 }; }, step: (/** @type {any} */ s) => ({ k: s.k + 1 }) });
  const C = tiny("cons", { state: { v: "f64", rev: "f64" }, ports: { in: { v: { seam: "f64", default: 0 } } } },
    { clock: () => ({ tick: 1 / 4 }), init: () => ({ v: 0, rev: 0 }), step: (/** @type {any} */ _s, /** @type {any} */ c) => ({ v: c.inputs.v, rev: c.inputs.$rev.v }) });
  const a = /** @type {any} */ (P.grammar("a").size(1)), b = /** @type {any} */ (C.grammar("b"));
  const composed = compose("f").part(a).part(b).wire(a.out.v, b.in.v).build();
  /** @param {number} n */
  const sized = (n) => /** @type {any} */ (P.grammar("a").size(n)).build();
  return { composed, runtimes: [P.runtime, C.runtime], sized };
}

test("a rebuild whose init throws keeps the previous revision running: the event fails with the diagnostics", () => {
  const { composed, runtimes, sized } = clocked();
  const run = createRun(composed, { runtimes, inputs: [{ kind: "rebuild", T: 0.6, part: "a", record: sized(13) }] });
  const key = run.key("a");
  run.runUntil(2);
  const e = run.builds[0];
  assert.equal(e.ok, false);
  assert.equal(e.changed, false);
  assert.deepEqual(e.revision, { before: 1, after: 1 });
  assert.deepEqual(e.diagnostics.map((/** @type {any} */ d) => d.code), ["N004"]);
  assert.match(/** @type {any} */ (e.diagnostics[0]).message, /init threw: 13 is unlucky/);
  assert.deepEqual(run.snapshot("a"), { state: { k: 9 }, revision: 1, T: "2" });
  assert.equal(run.key("a"), key);
  assert.equal(run.revision, 1);
  assert.deepEqual(run.state("b"), { v: 9, rev: 1 });
  assert.deepEqual(run.diagnostics, []);
});

test("a rebuild that changes a clock lands at its stamp however the run is chunked, and the new clock counts from there; replay agrees", () => {
  const { composed, runtimes, sized } = clocked();
  const inputs = [{ kind: "rebuild", T: 0.6, part: "a", record: sized(5) }, { kind: "rebuild", T: 0.65, part: "a", record: sized(1) }, { kind: "rebuild", T: 0.65, part: "a", record: sized(5) }];
  const whole = createRun(composed, { runtimes, inputs });
  whole.runUntil(2);
  const chunked = createRun(composed, { runtimes, inputs });
  chunked.runUntil(0.6);
  chunked.runUntil(0.7);
  chunked.runUntil(2);
  assert.deepEqual(chunked.hashes, whole.hashes);
  // each rebuild takes effect at its own stamp (ruling R2): the first moves a to 1/5 s, whose first instant at or
  // after 0.6 is 3/5 itself, so the two at 0.65 land after it
  assert.deepEqual(whole.builds.map((/** @type {any} */ b) => b.boundary), [{ after: "1/2", before: "3/5" }, { after: "3/5", before: "13/20" }, { after: "3/5", before: "13/20" }]);
  assert.ok(whole.hashes.some((/** @type {any} */ h) => h.T === "3/5"));
  assert.deepEqual(chunked.builds, whole.builds);
  assert.equal(replay(composed, { runtimes }, chunked.record()).ok, true);
});
