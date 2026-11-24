// The two sketches H3 ports, written as fields Programs: each lowers, with its Library
// functions and its own helpers, to Kernels that verify (without `partial`: nothing is unknown).
import { test } from "node:test";
import assert from "node:assert/strict";
import { lowerField } from "../index.js";
import { swirl, bulge } from "../programs/uv-remaps.js";
import { domainWarp } from "../programs/domain-warp.js";
import { verify } from "../../../ir/verify.js";
import { printKernel } from "../../../ir/print.js";
import { COLOR, VEC2 } from "../types.js";

/** @import { FieldProgram } from "../decls.js" */

/** @param {FieldProgram} program */
function lowered(program) {
  const r = lowerField(program);
  const all = [r.diagnostics, ...r.helpers.map((h) => h.result.diagnostics)].flat();
  assert.deepEqual(all.map((d) => `${d.code} ${d.message}`), [], program.name);
  const kernels = [r.kernel, ...r.helpers.map((h) => h.result.kernel)];
  for (const k of kernels) {
    assert.ok(k, program.name);
    assert.deepEqual(verify(/** @type {NonNullable<typeof k>} */ (k)), [], `${program.name}: ${k?.name}`);
  }
  return r;
}

test("swirl: pixel(uv, u) -> color, with grid and pmod lowered beside it", () => {
  const r = lowered(swirl);
  const k = /** @type {NonNullable<typeof r.kernel>} */ (r.kernel);
  assert.equal(k.slot, "pixel");
  assert.deepEqual(k.returns, COLOR);
  assert.deepEqual(k.params.map((p) => p.name), ["uv", "u"]);
  assert.deepEqual(k.params[0].t, VEC2);
  assert.deepEqual(r.helpers.filter((h) => h.kind === "fn").map((h) => h.name).sort(), ["grid", "pmod"]);
  assert.deepEqual(k.effects, ["call grid", "call pmod"], "a pixel's only effects are calls to its own helpers");
  assert.match(printKernel(k), /length\(/);
  assert.match(printKernel(k), /sin\(/);
});

test("bulge: the same grid, a smoothstep and a mix", () => {
  const r = lowered(bulge);
  const text = printKernel(/** @type {NonNullable<typeof r.kernel>} */ (r.kernel));
  assert.match(text, /smoothstep\(/);
  assert.match(text, /mix\(/);
});

test("domain-warp: a Library fbm over vnoise over the ihash intrinsic, a loop of five", () => {
  const r = lowered(domainWarp);
  assert.deepEqual(r.helpers.filter((h) => h.kind === "fn").map((h) => h.name).sort(), ["fbm", "vnoise"]);
  const fbm = printKernel(/** @type {NonNullable<(typeof r.helpers)[number]["result"]["kernel"]>} */ (r.helpers.find((h) => h.name === "fbm")?.result.kernel));
  assert.match(fbm, /for i = 0/);
  assert.match(fbm, /bound const 5/);
  const vnoise = printKernel(/** @type {NonNullable<(typeof r.helpers)[number]["result"]["kernel"]>} */ (r.helpers.find((h) => h.name === "vnoise")?.result.kernel));
  assert.match(vnoise, /ihash\(/);
  const main = printKernel(/** @type {NonNullable<typeof r.kernel>} */ (r.kernel));
  assert.match(main, /u\.palette/);
  assert.match(main, /fbm\(/);
});

test("params are uniforms: loads of read-only places, with no store rule", () => {
  const r = lowered(domainWarp);
  const k = /** @type {NonNullable<typeof r.kernel>} */ (r.kernel);
  assert.ok(k.effects.every((e) => e.startsWith("call ")), "no read or write: only calls to helpers");
  /** @param {unknown} v @param {Array<Record<string, any>>} out */
  const loads = (v, out = []) => {
    if (Array.isArray(v)) v.forEach((x) => loads(x, out));
    else if (v && typeof v === "object") {
      const o = /** @type {Record<string, any>} */ (v);
      if (o.k === "load") out.push(o);
      for (const [key, x] of Object.entries(o)) if (key !== "t") loads(x, out);
    }
    return out;
  };
  const found = loads(k.body);
  assert.ok(found.length > 5);
  for (const l of found) {
    assert.equal(l.place.owner, "Uniforms");
    assert.equal(l.place.store, undefined, "a uniform has no store rule");
  }
});

test("a library function the program does not use is not lowered", () => {
  const r = lowered(swirl);
  assert.ok(!r.helpers.some((h) => h.name === "fbm"));
});
