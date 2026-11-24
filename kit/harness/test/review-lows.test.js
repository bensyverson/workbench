// Regression tests from the review of the harness: the -0 location, a NaN tolerance, a shader that
// does not compile, and the verdict `faults` returns.
import { test } from "node:test";
import assert from "node:assert/strict";
import { compare } from "../compare.js";
import { runFaults, faultProblems, FAULTS } from "../index.js";

const shape = { width: 3, height: 2, labels: ["a"] };

test("a -0 against +0 is not exact, and is located where it happens", () => {
  const a = [new Float32Array(18)], b = [new Float32Array(18)];
  b[0][(1 * 3 + 2) * 3 + 1] = -0;
  const r = compare(a, b, shape, 0);
  assert.equal(r.exact, false);
  assert.deepEqual({ pixel: r.worst.pixel, channel: r.worst.channel, diff: r.worst.diff }, { pixel: [2, 1], channel: 1, diff: 0 });
});

test("a tolerance that is not a number is refused, since every comparison would pass", () => {
  const z = () => [new Float32Array(18)];
  assert.throws(() => compare(z(), z(), shape, NaN), /tolerance/);
  assert.throws(() => compare(z(), z(), shape, -1), /tolerance/);
});

const glslFault = FAULTS.filter((f) => f.targets.includes("glsl")).slice(0, 1);

test("a shader that does not compile is not a caught fault", async () => {
  const r = await runFaults({ scale: 0.1, faults: glslFault, render: async (jobs) => jobs.map((j) => ({ id: j.id, error: "boom", sets: [] })) });
  const row = r.rows.find((x) => x.target === "glsl");
  assert.equal(row?.caught, null);
  assert.equal(row?.error, "boom");
});

test("faultProblems names an unclean control, a shader error, an unexplained escape and an unplanted fault", async () => {
  const r = await runFaults({ scale: 0.1, faults: [] });
  assert.deepEqual(faultProblems(r), []);
  assert.match(faultProblems({ ...r, controls: [{ case: "x", jsExact: false, glslWorst: null }] }).join(), /control x/);
  assert.match(faultProblems({ ...r, controls: [{ case: "x", jsExact: true, glslWorst: r.tolerance * 2 }] }).join(), /control x/);
  const row = { id: "f", kind: /** @type {const} */ ("operator"), target: /** @type {const} */ ("glsl"), what: "", case: "c", planted: true, sites: [], caught: null, worst: null, at: null, error: "boom", escape: null };
  assert.match(faultProblems({ ...r, rows: [row] }).join(), /f.*boom/);
  assert.match(faultProblems({ ...r, rows: [{ ...row, error: null, caught: false }] }).join(), /unexplained escape: f/);
  assert.match(faultProblems({ ...r, rows: [{ ...row, error: null, planted: false }] }).join(), /not planted: f/);
});

test("a -0 mismatch is traced to a source line like any other", async () => {
  const { standardCases, prepare, referencePixels, compareJs } = await import("../index.js");
  const [c] = standardCases(0.1);
  const p = prepare(c.program);
  const ref = referencePixels(p, c);
  const i = ref[0].findIndex((v) => Object.is(v, 0));
  assert.ok(i >= 0, "the case has a +0 component to flip");
  ref[0][i] = -0;
  const { pair } = compareJs(p, c, ref);
  assert.equal(pair.exact, false);
  assert.equal(pair.worst.diff, 0);
  assert.ok(pair.at, "a located pixel has a source line");
});
