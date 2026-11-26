// An image param in the shader: a `sampler2D` uniform the host binds to a texture unit, read by `texture`, passed
// whole to a helper's sampler2D parameter, and sized by `textureSize`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { emitGlsl, fromLowering } from "../index.js";
import { glslType } from "../text.js";
import { field, lowerField, FIELDS_DIALECT } from "../../../dialects/fields/index.js";

const program = field("tiles")
  .param("atlas", { image: true })
  .param("k", { value: 2 })
  .fn("cell", "(img, p) => sample(img, p)")
  .pixel(`(uv, u) => {
  const s = imageSize(u.atlas);
  const c = cell(u.atlas, uv * u.k);
  return color(c.x, c.y, c.z * s.x / 8);
}`)
  .build();

test("a sampler is a sampler2D", () => {
  assert.equal(glslType("sampler"), "sampler2D");
});

test("an image param emits a sampler2D uniform, texture() and textureSize(), and a helper's sampler2D parameter", () => {
  const r = emitGlsl(fromLowering(lowerField(/** @type {any} */ (program))), FIELDS_DIALECT);
  assert.deepEqual(r.diagnostics, []);
  const src = /** @type {string} */ (r.source);
  assert.match(src, /^uniform sampler2D u_atlas;$/m);
  assert.match(src, /vec4 cell\(sampler2D img, vec2 p\)/);
  assert.match(src, /texture\(img, p\)/);
  assert.match(src, /vec2\(textureSize\(u_atlas, 0\)\)/);
  assert.match(src, /cell\(u_atlas, /);
  assert.deepEqual(r.uniforms.find((u) => u.param === "atlas"), { glsl: "u_atlas", param: "atlas", kind: "sampler2D" });
});
