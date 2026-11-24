// The emitted JS against the reference interpreter on the two H3 sketches, over a grid of
// pixels: every color component must be bit-identical (`Object.is`), not within a tolerance.
// The JS backend is "exact" against the reference in the fields Dialect's target table.
import { test } from "node:test";
import assert from "node:assert/strict";
import { emitKernel, emitHelpers, instantiate } from "../index.js";
import { run } from "../../../interp/index.js";
import { lowerField, INTRINSICS, FIELDS_DIALECT } from "../../../dialects/fields/index.js";
import { swirl, bulge } from "../../../dialects/fields/programs/uv-remaps.js";
import { domainWarp } from "../../../dialects/fields/programs/domain-warp.js";

/** @import { FieldProgram } from "../../../dialects/fields/decls.js" */
/** @import { Kernel } from "../../../ir/ir.js" */

/**
 * Lowers `program` and returns the interpreter's pixel function and the emitted one.
 * @param {FieldProgram} program
 */
function both(program) {
  const lowered = lowerField(program);
  assert.deepEqual([lowered.pixel, ...lowered.helpers.map((h) => h.result)].flatMap((r) => r.diagnostics).map((d) => d.message), [], program.name);
  const kernel = /** @type {Kernel} */ (lowered.kernel);
  /** @type {Record<string, Kernel>} */
  const helperKernels = {};
  for (const h of lowered.helpers) if (h.kind === "fn" && h.result.kernel) helperKernels[h.name] = h.result.kernel;
  const options = { intrinsics: INTRINSICS };
  const emitted = emitKernel(kernel, options);
  const fn = instantiate(emitted, emitHelpers(Object.values(helperKernels).map((h) => emitKernel(h, options))));
  return {
    emitted,
    reference: (/** @type {number[]} */ uv, /** @type {Record<string, unknown>} */ u) => /** @type {number[]} */ (run(kernel, [uv, u], { helpers: helperKernels, intrinsics: INTRINSICS })),
    js: (/** @type {number[]} */ uv, /** @type {Record<string, unknown>} */ u) => /** @type {number[]} */ (fn(uv, u)),
  };
}

/** A grid of positions, including ones outside the unit square and the exact corners. */
const GRID = Array.from({ length: 12 * 9 }, (_, i) => [-0.2 + (i % 12) * 0.1 + 1e-3 * (i % 7), -0.1 + Math.floor(i / 12) * 0.13]);

/**
 * Asserts the two agree on every pixel of the grid; returns how many were checked.
 * @param {FieldProgram} program
 * @param {Array<Record<string, unknown>>} uniforms
 */
function agree(program, uniforms) {
  const { reference, js, emitted } = both(program);
  let n = 0;
  for (const u of uniforms) for (const uv of GRID) {
    const want = reference(uv, u), got = js(uv, u);
    assert.deepStrictEqual(got, want, `${program.name} at ${uv} with ${JSON.stringify(u)}\n${emitted.source}`);
    n++;
  }
  return n;
}

const DEFAULTS = (/** @type {FieldProgram} */ p) => Object.fromEntries(Object.entries(p.params).map(([k, d]) => [k, d.value]));

test("the fields Dialect's JS target is compared exactly", () => {
  assert.deepEqual(FIELDS_DIALECT.targets.js.compare, { kind: "exact" });
});

test("swirl: emitted JS is bit-identical to the interpreter", (t) => {
  const base = { ...DEFAULTS(swirl), t: 0, aspect: 1 };
  const n = agree(swirl, [base, { ...base, angle: -3.3, cx: 40.5, cy: 99.9 }, { ...base, angle: 0.01, cx: 150, cy: 0 }]);
  t.diagnostic(`${n} pixels`);
});

test("bulge: emitted JS is bit-identical to the interpreter", (t) => {
  const base = { ...DEFAULTS(bulge), t: 0, aspect: 1 };
  const n = agree(bulge, [base, { ...base, strength: 0.2, cx: 60.3, cy: 80.7 }, { ...base, strength: 1, cx: 0, cy: 150 }]);
  t.diagnostic(`${n} pixels`);
});

test("domain-warp: emitted JS is bit-identical to the interpreter, in every palette and level", (t) => {
  const base = { ...DEFAULTS(domainWarp), t: 0, aspect: 440 / 300 };
  const cases = [];
  for (const palette of ["fog", "grey", "marble"]) for (const levels of [0, 1, 2]) cases.push({ ...base, palette, levels, t: levels * 1.3, seed: 1 + levels * 7, k: 4 - levels });
  const n = agree(domainWarp, cases);
  t.diagnostic(`${n} pixels`);
});

test("the emitted pixel function declares its own prelude and nothing else is needed", () => {
  const { emitted } = both(domainWarp);
  assert.match(emitted.prelude.join("\n"), /const \$fv/);
  assert.match(emitted.prelude.join("\n"), /function ihash|const clamp|const mix/);
  assert.match(emitted.source, /^function domain_warp_pixel\(uv, u\) \{/);
});
