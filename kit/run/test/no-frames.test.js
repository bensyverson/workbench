// A composed record without `frames` (an old one, or one made by hand) is refused at createRun (N007), and a record
// whose own plan fails is reported as such by the first rebuild, not planned as if it had no edges.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRun, RunError } from "../index.js";
import { bursts } from "./helpers.js";

const LONG = ["#########", "#..cc.cc#", "#########"];

test("a record without frames is refused at createRun with N007; one with an empty list runs", () => {
  const { composed, runtimes } = bursts();
  const { frames: _, ...old } = /** @type {any} */ (composed);
  assert.throws(() => createRun(old, { runtimes }), (/** @type {any} */ e) => e instanceof RunError && e.diagnostics.some((/** @type {any} */ d) => d.code === "N007" && /frames/.test(d.message)));
  const run = createRun({ ...composed, frames: [] }, { runtimes });
  run.runUntil(0.1);
  assert.equal(run.composed.frames.length, 0);
});

test("a record whose own plan fails reports that, not an S251 blamed on the rebuild", () => {
  const { composed, runtimes, M } = bursts();
  const broken = /** @type {any} */ (structuredClone(composed));
  broken.wires[0].convert[0].fromId = "nowhere.cell";
  const long = /** @type {any} */ (M.grammar("level").grid(LONG).control("(pl, pad) => { pl.dx = 1; }")).build();
  const run = createRun(broken, { runtimes, inputs: [{ kind: "rebuild", T: 0.2, part: "level", record: long }] });
  run.runUntil(0.5);
  assert.equal(run.builds[0].ok, false);
  assert.match(/** @type {any} */ (run.builds[0].diagnostics)[0].message, /own plan fails/);
});

test("a conversion without its frame ids (a record from before they were recorded) is refused at createRun with N007", () => {
  const { composed, runtimes } = bursts();
  const old = /** @type {any} */ (structuredClone(composed));
  const c = old.wires.flatMap((/** @type {any} */ w) => w.convert)[0];
  assert.ok(c, "the bursts record has a conversion");
  delete c.fromId;
  assert.throws(() => createRun(old, { runtimes }), (/** @type {any} */ e) => e instanceof RunError && e.diagnostics.some((/** @type {any} */ d) => d.code === "N007" && /fromId/.test(d.message)));
  createRun(composed, { runtimes }).runUntil(0.1);
});
