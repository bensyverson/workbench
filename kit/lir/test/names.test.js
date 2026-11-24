// Identifiers the LIR may hold: GLSL ES 3.00's keywords, reserved words and macros, and unique legal names.
import { test } from "node:test";
import assert from "node:assert/strict";
import { identifierProblem, safeName } from "../names.js";

test("every word GLSL ES 3.00 reserves (section 3.8) is refused as an identifier", () => {
  const words = `coherent volatile restrict readonly writeonly atomic_uint noperspective image1D image2D image3D imageCube image1DArray image2DArray imageBuffer
    iimage1D iimage2D iimage3D iimageCube iimage1DArray iimage2DArray iimageBuffer uimage1D uimage2D uimage3D uimageCube uimage1DArray uimage2DArray uimageBuffer
    samplerBuffer isamplerBuffer usamplerBuffer sampler2DMS sampler2DMSArray isampler2DMS usampler2DMS isampler2DMSArray usampler2DMSArray
    sampler1DArray sampler1DArrayShadow isampler1D isampler1DArray usampler1D usampler1DArray isampler2DRect usampler2DRect
    packed shared buffer row_major column_major union interface input output`.split(/\s+/);
  for (const w of words) assert.notEqual(identifierProblem(w), null, `${w} must be refused`);
});

test("the built-in functions of ES 3.00, texture lookups included, are refused", () => {
  for (const w of ["textureGrad", "textureOffset", "textureProjLod", "textureLodOffset", "texelFetchOffset", "textureProjGrad", "textureProjOffset", "textureGradOffset", "textureProjLodOffset", "textureProjGradOffset"]) {
    assert.notEqual(identifierProblem(w), null, `${w} must be refused`);
  }
});

test("a name beginning GL_ is refused (the preprocessor's macros: GL_ES), and safeName prefixes it", () => {
  assert.notEqual(identifierProblem("GL_ES"), null);
  assert.equal(identifierProblem("GLX"), null);
  const name = safeName("GL_ES", new Set());
  assert.equal(identifierProblem(name), null);
});

test("safeName never makes a double underscore, whatever it collides with", () => {
  const taken = new Set();
  const a = safeName("min_", taken);
  const b = safeName("min", taken);
  const c = safeName("min", taken);
  for (const n of [a, b, c]) assert.equal(identifierProblem(n), null, `${n} is a legal identifier`);
  assert.equal(new Set([a, b, c]).size, 3);
});

test("safeName still gives an unreserved, untaken name as it is", () => {
  assert.equal(safeName("speed", new Set()), "speed");
  assert.equal(safeName("speed", new Set(["speed"])), "speed_");
});
