// The JS twin of a sampler: an image param's value is a SamplerImage (kit/interp: RGBA bytes, row 0 the bottom),
// passed whole; `sample` reads the nearest texel with the coordinates clamped to the edge, as bytes over 255. The
// emitted JS and the reference interpreter agree bit for bit, inside the image and outside it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { emitKernel, emitHelpers, instantiate } from "../index.js";
import { run } from "../../../interp/index.js";
import { field, lowerField, INTRINSICS } from "../../../dialects/fields/index.js";

/** @import { Kernel } from "../../../ir/ir.js" */
/** @import { SamplerImage } from "../../../interp/interp.js" */

/** A 4 by 2 image: texel (i, j) is (i * 60, j * 200, 7, 255 - i), so a read says which texel it hit. @type {SamplerImage} */
const IMAGE = { width: 4, height: 2, data: Array.from({ length: 4 * 2 }, (_, n) => { const i = n % 4, j = Math.floor(n / 4); return [i * 60, j * 200, 7, 255 - i]; }).flat() };

const program = /** @type {any} */ (field("look")
  .param("img", { image: true })
  .fn("cell", "(s, p) => sample(s, p)")
  .pixel(`(uv, u) => {
  const c = cell(u.img, uv);
  const z = imageSize(u.img);
  return color(c.x, c.y + c.w, c.z + z.x * 0.001 + z.y * 0.0001);
}`)
  .build());

function both() {
  const lowered = lowerField(program);
  assert.deepEqual([lowered.pixel, ...lowered.helpers.map((h) => h.result)].flatMap((r) => r.diagnostics).map((d) => d.message), []);
  const kernel = /** @type {Kernel} */ (lowered.kernel);
  /** @type {Record<string, Kernel>} */
  const helpers = {};
  for (const h of lowered.helpers) if (h.kind === "fn" && h.result.kernel) helpers[h.name] = h.result.kernel;
  const options = { intrinsics: INTRINSICS };
  const fn = instantiate(emitKernel(kernel, options), emitHelpers(Object.values(helpers).map((h) => emitKernel(h, options))));
  return {
    ref: (/** @type {number[]} */ uv) => /** @type {number[]} */ (run(kernel, [uv, { img: IMAGE, t: 0, aspect: 1 }], { helpers, intrinsics: INTRINSICS })),
    js: (/** @type {number[]} */ uv) => /** @type {number[]} */ (fn(uv, { img: IMAGE, t: 0, aspect: 1 })),
  };
}

const f = Math.fround;
/** The color `look` gives at texel (i, j) of IMAGE. @param {number} i @param {number} j */
const texel = (i, j) => [f(i * 60 / 255), f(f(j * 200 / 255) + f((255 - i) / 255)), f(f(f(7 / 255) + f(4 * f(0.001))) + f(2 * f(0.0001)))];

test("sample reads the nearest texel, row 0 at the bottom, as bytes over 255", () => {
  const { ref } = both();
  assert.deepEqual(ref([0.1, 0.1]), texel(0, 0));
  assert.deepEqual(ref([0.6, 0.1]), texel(2, 0));
  assert.deepEqual(ref([0.9, 0.9]), texel(3, 1));
});

test("outside the unit square the coordinates clamp to the edge texel", () => {
  const { ref } = both();
  assert.deepEqual(ref([-3, 0.2]), texel(0, 0));
  assert.deepEqual(ref([7, 0.8]), texel(3, 1));
  assert.deepEqual(ref([0.3, -1]), texel(1, 0));
  assert.deepEqual(ref([1, 1]), texel(3, 1), "1.0 is past the last texel's start, so it clamps");
});

test("the emitted JS agrees with the interpreter bit for bit over a grid inside and outside the image", () => {
  const { ref, js } = both();
  for (let a = -0.3; a <= 1.3; a += 0.07) for (let b = -0.3; b <= 1.3; b += 0.09) {
    const uv = [f(a), f(b)];
    assert.deepStrictEqual(js(uv), ref(uv), String(uv));
  }
});
