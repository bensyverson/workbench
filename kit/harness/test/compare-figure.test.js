import { test } from "node:test";
import assert from "node:assert/strict";
import * as harness from "../index.js";
import { FIELDS_DIALECT } from "../../dialects/fields/index.js";
import { standardCases, stressCase } from "../cases.js";
import { runCase } from "../run.js";
import { runFaults, faultProblems } from "../sensitivity.js";
import { figureFor, targetFigure, glslFigure } from "../target.js";

const swirl = () => standardCases(0.1)[0];

test("the fields Dialect declares each target's compare mode, in the terms defineDialect resolves to", () => {
  assert.deepEqual(FIELDS_DIALECT.targets.js.compare, { kind: "exact" });
  assert.deepEqual(FIELDS_DIALECT.targets.glsl.compare, { kind: "tolerance", figure: 1e-3 });
});

test("the harness reads its figure from the target, and keeps no tolerance constant", () => {
  assert.equal(glslFigure(), 1e-3);
  assert.equal(targetFigure(FIELDS_DIALECT, "js"), 0);
  assert.equal(targetFigure({ targets: { glsl: { compare: { kind: "tolerance", figure: 0.25 } } } }, "glsl"), 0.25);
  assert.equal("GLSL_TOLERANCE" in harness, false);
});

test("a case with no override is held to the target's figure", () => {
  assert.deepEqual(figureFor(swirl()), { figure: 1e-3, override: null });
});

test("an override with a reason replaces the figure and carries the reason", () => {
  const c = { ...swirl(), override: { figure: 1e-2, reason: "five octaves chained twice" } };
  assert.deepEqual(figureFor(c), { figure: 1e-2, override: { figure: 1e-2, reason: "five octaves chained twice" } });
});

test("an override without a reason is refused, and so is one with a blank reason or a figure that is not positive", () => {
  for (const override of [{ figure: 1e-2 }, { figure: 1e-2, reason: "  " }, { figure: 1e-2, reason: 7 }, { figure: 0, reason: "why" }, { figure: NaN, reason: "why" }]) {
    assert.throws(() => figureFor({ ...swirl(), override: /** @type {any} */ (override) }), /override.*(reason|positive)/i, JSON.stringify(override));
  }
});

test("runCase refuses a case whose override has no reason, and reports an override that has one", async () => {
  await assert.rejects(runCase({ ...swirl(), override: /** @type {any} */ ({ figure: 1e-2 }) }), /reason/);
  const r = await runCase({ ...swirl(), override: { figure: 1e-2, reason: "because" } });
  assert.deepEqual(r.override, { figure: 1e-2, reason: "because" });
  assert.equal(r.tolerance, 1e-2);
  assert.equal((await runCase(swirl())).override, null);
});

test("the stress case overrides the figure and says why", () => {
  const o = stressCase(0.1).override;
  assert.equal(o?.figure, 1e-2);
  assert.match(o?.reason ?? "", /5\.18e-3/);
});

test("faultProblems prints an override and its reason beside the control it loosened", async () => {
  const c = { ...swirl(), override: { figure: 1e-2, reason: "because" } };
  const result = await runFaults({ cases: [c], faults: [] });
  assert.deepEqual(result.overrides, [{ case: c.name, figure: 1e-2, reason: "because" }]);
  const loose = { ...result, controls: [{ case: c.name, jsExact: true, glslWorst: 5e-3, tolerance: 1e-2 }] };
  assert.deepEqual(faultProblems(loose), []);
  const tight = { ...result, controls: [{ case: c.name, jsExact: true, glslWorst: 5e-2, tolerance: 1e-2 }] };
  assert.match(faultProblems(tight).join("\n"), /held to 0\.01 \(override: because\)/);
  await assert.rejects(runFaults({ cases: [{ ...c, override: /** @type {any} */ ({ figure: 1 }) }], faults: [] }), /reason/);
});
