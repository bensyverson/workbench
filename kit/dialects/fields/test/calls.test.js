// H3's call style: the two survey sketches written with no operator on a vector (vadd, vsub, vscale)
// lower to Kernels that verify, and over a pixel grid the interpreter's output is bit-identical to the
// typed-operator sketches'. The emitted JS of the call style also matches its own interpreter run.
import { test } from "node:test";
import assert from "node:assert/strict";
import { lowerField } from "../index.js";
import { swirlCalls, bulgeCalls } from "../programs/uv-remaps-calls.js";
import { domainWarpCalls } from "../programs/domain-warp-calls.js";
import { standardCases, prepare, referencePixels, runCase } from "../../../harness/index.js";
import { verify } from "../../../ir/verify.js";

const CALLS = { swirl: swirlCalls, bulge: bulgeCalls, "domain-warp": domainWarpCalls };

test("every call-style sketch lowers clean and every Kernel verifies", () => {
  for (const [name, program] of Object.entries(CALLS)) {
    const r = lowerField(program);
    assert.deepEqual([r.diagnostics, ...r.helpers.map((h) => h.result.diagnostics)].flat().map((d) => `${d.code} ${d.message}`), [], name);
    for (const k of [r.kernel, ...r.helpers.map((h) => h.result.kernel)]) {
      assert.ok(k, name);
      assert.deepEqual(verify(/** @type {NonNullable<typeof k>} */ (k)), [], name);
    }
  }
});

test("call style and typed style give bit-identical pixels in the interpreter, on every recorded param set", () => {
  for (const c of standardCases(0.1)) {
    const calls = { ...c, program: CALLS[/** @type {keyof typeof CALLS} */ (c.name)] };
    assert.ok(calls.program, c.name);
    const typed = referencePixels(prepare(c.program), c);
    const called = referencePixels(prepare(calls.program), calls);
    assert.equal(typed.length, c.sets.length);
    typed.forEach((a, s) => {
      const b = called[s];
      assert.equal(a.length, b.length);
      for (let i = 0; i < a.length; i++) assert.ok(Object.is(a[i], b[i]), `${c.name} set '${c.sets[s].label}' component ${i}: typed ${a[i]}, calls ${b[i]}`);
    });
  }
});

test("the call style's emitted JS agrees with its own interpreter run, bit for bit", async () => {
  for (const c of standardCases(0.1)) {
    const r = await runCase({ ...c, program: CALLS[/** @type {keyof typeof CALLS} */ (c.name)] });
    assert.equal(r.jsVsInterp.exact, true, c.name);
  }
});
