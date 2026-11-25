// The fast half of the harness: the emitted JS against the interpreter, bit for bit, on all three sketches over
// every recorded param set at a small grid; and the JS half of the planted-fault run. GLSL is in prerelease/.
import { test } from "node:test";
import assert from "node:assert/strict";
import { standardCases, coverageCase, runCase, runFaults, tally, FAULTS } from "../index.js";
import { INTRINSICS } from "../../dialects/fields/index.js";

test("JS and the interpreter agree bit for bit on every sketch and param set", async (t) => {
  for (const c of standardCases(0.2)) {
    const r = await runCase(c);
    assert.equal(r.jsVsInterp.exact, true, `${c.name}: worst ${r.jsVsInterp.worst.diff} at ${r.jsVsInterp.worst.pixel}, ${JSON.stringify(r.jsVsInterp.at)}`);
    assert.equal(r.glslVsInterp, null, "no renderer was given, so GLSL did not run");
    t.diagnostic(`${c.name}: ${c.width}x${c.height}, ${c.sets.length} sets, ${r.jsVsInterp.components} components identical`);
  }
});

test("every planted JS fault is caught, except the ones with a recorded reason", async (t) => {
  const { rows, controls } = await runFaults({ scale: 0.1 });
  const js = rows.filter((r) => r.target === "js");
  assert.deepEqual(js.filter((r) => !r.planted).map((r) => r.id), [], "every fault changed something");
  assert.deepEqual(js.filter((r) => !r.caught && !r.escape).map((r) => r.id), [], "no unexplained escape");
  assert.deepEqual(js.filter((r) => r.caught && r.escape).map((r) => r.id), [], "no escape claimed for a fault that was caught");
  assert.ok(controls.every((c) => c.jsExact), "unplanted pipelines are clean");
  assert.equal(rows.filter((r) => r.target === "glsl" && r.caught !== null).length, 0, "GLSL faults need a renderer, so none ran");
  const t2 = tally(rows).js;
  t.diagnostic(`${t2.caught} of ${t2.planted} JS faults caught; escaped: ${t2.escaped.map((e) => e.id).join(", ")}`);
  assert.ok(t2.caught >= 20);
});

test("a fault with an escape reason names a target it applies to", () => {
  for (const f of FAULTS) for (const target of Object.keys(f.escapes ?? {})) assert.ok(f.targets.includes(/** @type {"js" | "glsl"} */ (target)), `${f.id} claims an escape on ${target}`);
});

test("the coverage case calls every intrinsic of the Dialect, and JS and the interpreter agree on it bit for bit", async (t) => {
  const c = coverageCase(0.3);
  const missing = Object.keys(INTRINSICS).filter((name) => !new RegExp(`\\b${name}\\(`).test(c.program.pixel));
  assert.deepEqual(missing, [], "an intrinsic no sketch of the coverage case calls would never reach a GPU");
  const r = await runCase(c);
  assert.equal(r.jsVsInterp.exact, true, `worst ${r.jsVsInterp.worst.diff} at ${r.jsVsInterp.worst.pixel}, ${JSON.stringify(r.jsVsInterp.at)}`);
  assert.ok(Number.isFinite(r.jsVsInterp.worst.diff));
  t.diagnostic(`${c.name}: ${c.width}x${c.height}, ${c.sets.length} sets, ${r.jsVsInterp.components} components identical`);
});
