// A SamplerImage is validated where it enters the harness (leaf 6fwujM): positive whole width and height, `data` of
// width * height * 4 entries, each a whole byte 0..255. A bad one is a named ImageError, not a NaN or a wrapped byte.
import { test } from "node:test";
import assert from "node:assert/strict";
import { coverageCase, prepare, uniformValues, testImage, checkImage, ImageError } from "../index.js";

/** @param {unknown} img @param {RegExp} re */
const refused = (img, re) => assert.throws(() => checkImage(img), (e) => e instanceof ImageError && e.name === "ImageError" && re.test(e.message));

test("checkImage accepts a whole image, typed or plain", () => {
  const img = testImage(4, 2);
  assert.equal(checkImage(img), img);
  assert.doesNotThrow(() => checkImage({ width: 1, height: 1, data: [0, 128, 255, 7] }));
});

test("checkImage names each way an image is wrong", () => {
  refused(null, /not an image/);
  refused(undefined, /not an image/);
  refused(7, /not an image/);
  refused({ width: 0, height: 0, data: [] }, /width/);
  refused({ width: 2, height: 0, data: [] }, /height/);
  refused({ width: 2.5, height: 1, data: Array(10).fill(0) }, /width/);
  refused({ width: -1, height: 1, data: [] }, /width/);
  refused({ width: 2, height: 2, data: [1, 2, 3, 4] }, /16/);
  refused({ width: 1, height: 1, data: [256, 0, 0, 0] }, /byte/);
  refused({ width: 1, height: 1, data: [0, -1, 0, 0] }, /byte/);
  refused({ width: 1, height: 1, data: [0, 1.9, 0, 0] }, /byte/);
  refused({ width: 1, height: 1, data: [0, 0, 0, NaN] }, /byte/);
  refused({ width: 1, height: 1 }, /data/);
});

test("uniformValues refuses a bad image by name, before it is encoded", () => {
  const c = coverageCase(0.3);
  const p = prepare(c.program);
  const u = /** @type {NonNullable<ReturnType<typeof p.glsl.uniforms.find>>} */ (p.glsl.uniforms.find((x) => x.kind === "sampler2D"));
  for (const bad of [null, { width: 0, height: 0, data: [] }]) {
    assert.throws(() => uniformValues(p, { ...c.sets[0].values, [u.param]: /** @type {any} */ (bad) }), ImageError);
  }
  assert.doesNotThrow(() => uniformValues(p, c.sets[0].values));
});
