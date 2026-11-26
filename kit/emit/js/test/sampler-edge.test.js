// fields is an f32 Dialect, so `sample`'s texel index is the f32 product, as a GPU rounds it: the reference and the JS
// twin both take Math.floor(Math.fround(v * n)) (leaf 6fwujM). On an exact texel edge the f64 product can fall just
// under the integer where the f32 product rounds to it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { emitKernel, emitHelpers, instantiate } from "../index.js";
import { run } from "../../../interp/index.js";
import { field, lowerField, INTRINSICS } from "../../../dialects/fields/index.js";

/** @import { Kernel } from "../../../ir/ir.js" */

const program = /** @type {any} */ (field("edge")
  .param("img", { image: true })
  .pixel("(uv, u) => { const c = sample(u.img, uv); return color(c.x, c.y, c.z); }")
  .build());

/** An n by m image whose red channel is the texel's column times 20, green its row times 20. @param {number} n @param {number} m */
const grid = (n, m) => ({ width: n, height: m, data: Array.from({ length: n * m * 4 }, (_, k) => { const t = Math.floor(k / 4); return [(t % n) * 20, Math.floor(t / n) * 20, 0, 255][k % 4]; }) });

const lowered = lowerField(program);
const kernel = /** @type {Kernel} */ (lowered.kernel);
const fn = instantiate(emitKernel(kernel, { intrinsics: INTRINSICS }), emitHelpers([]));
/** @param {{ width: number, height: number, data: number[] }} img @param {number[]} uv */
const both = (img, uv) => ({
  ref: /** @type {number[]} */ (run(kernel, [uv, { img, t: 0, aspect: 1 }], { helpers: {}, intrinsics: INTRINSICS })),
  js: /** @type {number[]} */ (fn(uv, { img, t: 0, aspect: 1 })),
});

test("R=5 over a 10-texel image, pixel 3: the f32 product is 7, so texel 7 in the reference and the twin", () => {
  const x = Math.fround(3.5 / 5);
  assert.ok(x * 10 < 7 && Math.fround(x * 10) === 7, "the two products split here");
  assert.equal(/** @type {number[]} */ (INTRINSICS.sample.ref(grid(10, 1), x, 0.5))[0], 140 / 255);
  const { ref, js } = both(grid(10, 1), [x, 0.5]);
  assert.equal(ref[0], Math.fround(140 / 255));
  assert.deepEqual(js, ref);
});

test("the same on y, and the reference and twin agree over every pixel center of several grids and sizes", () => {
  const y = Math.fround(3.5 / 5);
  assert.equal(/** @type {number[]} */ (INTRINSICS.sample.ref(grid(1, 10), 0.5, y))[1], 140 / 255);
  for (const R of [5, 7, 9, 15, 25, 50]) for (const n of [10, 20, 6, 30]) for (let i = 0; i < R; i++) {
    const v = Math.fround((i + 0.5) / R), want = Math.min(n - 1, Math.floor(Math.fround(v * n)));
    const { ref, js } = both(grid(n, n), [v, v]);
    assert.deepEqual(js, ref);
    assert.equal(ref[0], Math.fround(want * 20 / 255));
    assert.equal(ref[1], Math.fround(want * 20 / 255));
  }
});
