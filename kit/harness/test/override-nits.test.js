// Review nits on overrides: `override: null` is no override, runFaults keys figures by case object (two cases may
// share a name), and an override the caller's `tolerance` replaced says which figure was used.
import { test } from "node:test";
import assert from "node:assert/strict";
import { standardCases, runCase, runFaults, faultProblems } from "../index.js";
import { figureFor } from "../target.js";

test("override: null is treated like no override", async () => {
  const c = { ...standardCases(0.1)[0], override: /** @type {any} */ (null) };
  assert.deepEqual(figureFor(c).override, null);
  assert.equal(figureFor(c).figure, figureFor(standardCases(0.1)[0]).figure);
  assert.equal((await runCase(c)).override, null);
});

test("an override the caller's tolerance replaced is reported with the figure used", async () => {
  const [base] = standardCases(0.1);
  const c = { ...base, override: { figure: 1e-2, reason: "measured 5e-3" } };
  const r = await runFaults({ scale: 0.1, faults: [], cases: [c], tolerance: 0.5 });
  assert.deepEqual(r.overrides, [{ case: c.name, figure: 1e-2, reason: "measured 5e-3", held: 0.5 }]);
  const plain = await runFaults({ scale: 0.1, faults: [], cases: [c] });
  assert.deepEqual(plain.overrides.map((o) => o.held), [1e-2]);
});

test("two cases of one name keep their own overrides", async () => {
  const [a, b] = standardCases(0.1);
  const one = { ...a, override: { figure: 1e-2, reason: "first" } };
  const two = { ...a, override: { figure: 2e-2, reason: "second" } };
  const r = await runFaults({ scale: 0.1, faults: [], cases: [one, two, b] });
  assert.deepEqual(r.controls.filter((x) => x.case === a.name).map((x) => x.tolerance), [1e-2, 2e-2]);
  assert.deepEqual(r.overrides.map((o) => o.reason), ["first", "second"]);
});

test("a control's problem line says which figure held it when the caller's tolerance replaced an override", async () => {
  const r = await runFaults({ scale: 0.1, faults: [] });
  const line = faultProblems({ ...r, tolerance: 0.5, controls: [{ case: "x", jsExact: true, glslWorst: 1, tolerance: 0.5 }], overrides: [{ case: "x", figure: 1e-2, reason: "why", held: 0.5 }] }).join();
  assert.match(line, /held to 0\.5 \(the caller's tolerance; the case's override is 0\.01: why\)/);
});
