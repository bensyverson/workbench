// The GLSL half of the harness, through sleepy: the recorded cases at full size, the edge of the sketches' ranges, and
// the planted faults. Skips with a message where sleepy (or its WebGL2 with float readback) is not available.
import { test } from "node:test";
import assert from "node:assert/strict";
import { standardCases, stressCase, coverageCase, runCase, runFaults, tally, glslFigure } from "../../../kit/harness/index.js";
import { probeSleepy, sleepyRender } from "../sleepy.js";

const probe = probeSleepy();
const skip = probe.ok ? false : `GLSL half skipped: ${probe.why}`;
if (!probe.ok) console.log(skip);
const render = sleepyRender();

for (const c of standardCases()) {
  test(`${c.name}: JS is exact and GLSL is within ${glslFigure()} of the interpreter over ${c.width}x${c.height} pixels and ${c.sets.length} param sets`, { skip }, async (t) => {
    const r = await runCase(c, { render });
    assert.equal(r.glslError, null);
    assert.equal(r.jsVsInterp.exact, true, `JS: worst ${r.jsVsInterp.worst.diff} at ${r.jsVsInterp.worst.pixel}`);
    const g = /** @type {NonNullable<typeof r.glslVsInterp>} */ (r.glslVsInterp);
    assert.equal(g.over, 0, `GLSL: worst ${g.worst.diff} at pixel ${g.worst.pixel}, set ${g.worst.set}, ${JSON.stringify(g.at)}`);
    t.diagnostic(`GLSL worst ${g.worst.diff} on ${probe.ok ? probe.renderer.renderer : "?"}; tolerance ${r.tolerance}`);
  });
}

test(`coverage (every intrinsic and call-style operator): JS is exact and GLSL is within ${glslFigure()} of the interpreter`, { skip }, async (t) => {
  const c = coverageCase();
  const r = await runCase(c, { render });
  assert.equal(r.glslError, null);
  assert.equal(r.jsVsInterp.exact, true, `JS: worst ${r.jsVsInterp.worst.diff} at ${r.jsVsInterp.worst.pixel}`);
  const g = /** @type {NonNullable<typeof r.glslVsInterp>} */ (r.glslVsInterp);
  assert.equal(g.over, 0, `GLSL: worst ${g.worst.diff} at pixel ${g.worst.pixel}, set ${g.worst.set}, channel ${g.worst.channel}, ref ${g.worst.ref}, got ${g.worst.got}, ${JSON.stringify(g.at)}`);
  t.diagnostic(`${c.width}x${c.height}, ${c.sets.length} sets; GLSL worst ${g.worst.diff}`);
});

test("domain-warp at the edge of its ranges stays within its overridden figure (1e-2, with the reason the case states)", { skip }, async (t) => {
  const r = await runCase(stressCase(), { render });
  assert.equal(r.glslError, null);
  assert.equal(r.jsVsInterp.exact, true);
  const g = /** @type {NonNullable<typeof r.glslVsInterp>} */ (r.glslVsInterp);
  assert.equal(g.over, 0, `worst ${g.worst.diff}`);
  t.diagnostic(`worst ${g.worst.diff} per set: ${g.sets.map((s) => s.worst.toExponential(2)).join(" ")}`);
});

test("every planted fault is caught in both backends, except the ones with a recorded reason", { skip }, async (t) => {
  const { rows, controls } = await runFaults({ render });
  assert.deepEqual(rows.filter((r) => !r.planted).map((r) => `${r.id}/${r.target}`), []);
  assert.deepEqual(rows.filter((r) => r.error).map((r) => `${r.id}: ${r.error}`), [], "every mutated shader compiled");
  assert.deepEqual(rows.filter((r) => !r.caught && !r.escape).map((r) => `${r.id}/${r.target}`), [], "no unexplained escape");
  assert.deepEqual(rows.filter((r) => r.caught && r.escape).map((r) => `${r.id}/${r.target}`), [], "no escape claimed for a fault that was caught");
  for (const c of controls) {
    assert.equal(c.jsExact, true, c.case);
    assert.ok(/** @type {number} */ (c.glslWorst) <= (c.tolerance ?? glslFigure()), `${c.case}: the unplanted shader differs by ${c.glslWorst}`);
  }
  const x = tally(rows);
  t.diagnostic(`JS ${x.js.caught}/${x.js.planted} caught; GLSL ${x.glsl.caught}/${x.glsl.planted} caught; escaped: ${[...x.js.escaped, ...x.glsl.escaped].map((e) => `${e.id}/${e.target}`).join(", ")}`);
});
