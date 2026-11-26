// Image params in the harness: a recorded test image, given to every image param by default; the interpreter and the
// JS function get it whole, the shader gets it as RGBA8 bytes (base64 across the page boundary) bound to a texture
// unit with NEAREST filtering and CLAMP_TO_EDGE, the convention `sample`'s reference implements.
import { test } from "node:test";
import assert from "node:assert/strict";
import { testImage, coverageCase, prepare, uniformValues, renderJobs, encodeImage, decodeImage } from "../index.js";

/** @import { SamplerImage } from "../../interp/interp.js" */

test("testImage is a SamplerImage of bytes, the same every time", () => {
  const a = testImage(8, 4), b = testImage(8, 4);
  assert.equal(a.width, 8);
  assert.equal(a.height, 4);
  assert.equal(a.data.length, 8 * 4 * 4);
  assert.deepEqual(Array.from(a.data), Array.from(b.data));
  assert.ok(Array.from(a.data).every((v) => Number.isInteger(v) && v >= 0 && v <= 255));
  assert.ok(new Set(Array.from(a.data)).size > 8, "a test image varies, so a texel read in the wrong place shows");
});

test("encodeImage and decodeImage round-trip the bytes", () => {
  const img = testImage(4, 2);
  const back = decodeImage(encodeImage(img));
  assert.equal(back.width, 4);
  assert.equal(back.height, 2);
  assert.deepEqual(Array.from(back.data), Array.from(img.data));
});

test("the coverage case gives its image param the test image, and the shader gets it encoded", () => {
  const c = coverageCase(0.3);
  const p = prepare(c.program);
  const u = p.glsl.uniforms.find((x) => x.kind === "sampler2D");
  assert.ok(u, "the coverage case has an image param");
  const values = c.sets[0].values;
  const img = /** @type {SamplerImage} */ (values[u.param]);
  assert.ok(img && typeof img === "object" && "data" in img);
  const { host, gl } = uniformValues(p, values);
  assert.equal(host[u.param], img);
  assert.deepEqual(gl[u.glsl], encodeImage(img));
});

/** WebGL's own value, so a unit is `TEXTURE0 + n` as in a real context. */
const TEXTURE0 = 33984;

/**
 * A WebGL2 context that records every call and answers as a working one would; constants are their own names, but TEXTURE0.
 * @returns {{ gl: WebGL2RenderingContext, calls: Array<[string, unknown[]]> }}
 */
function fakeGl() {
  /** @type {Array<[string, unknown[]]>} */
  const calls = [];
  const answers = /** @type {Record<string, (...a: unknown[]) => unknown>} */ ({
    getExtension: () => ({}), getShaderParameter: () => true, getProgramParameter: () => true,
    checkFramebufferStatus: () => "FRAMEBUFFER_COMPLETE", getUniformLocation: (_p, name) => `loc:${name}`,
  });
  const gl = new Proxy({}, {
    get: (_t, name) => {
      if (typeof name !== "string") return undefined;
      if (name === "TEXTURE0") return TEXTURE0;
      if (/^[A-Z0-9_]+$/.test(name)) return name;
      return (/** @type {unknown[]} */ ...args) => { calls.push([name, args]); return answers[name] ? answers[name](...args) : {}; };
    },
  });
  return { gl: /** @type {WebGL2RenderingContext} */ (/** @type {unknown} */ (gl)), calls };
}

test("renderJobs uploads an image uniform as RGBA8, NEAREST and CLAMP_TO_EDGE, on its own texture unit", () => {
  const { gl, calls } = fakeGl();
  const img = testImage(4, 2);
  renderJobs(gl, [{ id: "j", source: "x", width: 2, height: 2, resolution: "wb_resolution", uniforms: [{ glsl: "u_k", kind: "float" }, { glsl: "u_img", kind: "sampler2D" }], sets: [{ u_k: 1, u_img: encodeImage(img) }] }]);
  const named = (/** @type {string} */ n) => calls.filter(([c]) => c === n).map(([, a]) => a);
  const upload = named("texImage2D").find((a) => a[2] === "RGBA8");
  assert.ok(upload, "an RGBA8 upload");
  assert.deepEqual(upload.slice(3, 8), [4, 2, 0, "RGBA", "UNSIGNED_BYTE"]);
  assert.deepEqual([.../** @type {Uint8Array} */ (upload[8])], Array.from(img.data));
  const params = named("texParameteri").map((a) => `${a[1]}=${a[2]}`);
  for (const p of ["TEXTURE_MIN_FILTER=NEAREST", "TEXTURE_MAG_FILTER=NEAREST", "TEXTURE_WRAP_S=CLAMP_TO_EDGE", "TEXTURE_WRAP_T=CLAMP_TO_EDGE"]) assert.ok(params.includes(p), p);
  const unit = named("uniform1i").find((a) => a[0] === "loc:u_img");
  assert.ok(unit && unit[1] !== 0, "the image's unit is not unit 0, where the output texture was bound");
  assert.ok(named("activeTexture").some((a) => a[0] === TEXTURE0 + Number(unit?.[1])), "the image is bound on that unit");
  assert.equal(named("pixelStorei").find((a) => a[0] === "UNPACK_FLIP_Y_WEBGL")?.[1], false, "rows go up as given: row 0 is the bottom");
});
