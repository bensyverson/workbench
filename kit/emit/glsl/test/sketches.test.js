// The survey's Kernels as GLSL ES 3.00: the emitted text and its line map against goldens, the LIR they
// pass through verified, and the shape of the shader the harness will run.
// After a deliberate change, rewrite the goldens with `UPDATE_GOLDEN=1 node --test kit/emit/glsl/test/sketches.test.js` and review the diff.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { emitGlsl, fromLowering, showLineMap } from "../index.js";
import { verifyLir } from "../../../lir/index.js";
import { lowerField, FIELDS_DIALECT } from "../../../dialects/fields/index.js";
import { swirl, bulge } from "../../../dialects/fields/programs/uv-remaps.js";
import { domainWarp } from "../../../dialects/fields/programs/domain-warp.js";

/** @import { FieldProgram } from "../../../dialects/fields/decls.js" */

const GOLDEN = new URL("./golden/", import.meta.url);
const UPDATE = process.env.UPDATE_GOLDEN === "1";

/** @param {FieldProgram} program */
function emitted(program) {
  const lowering = lowerField(program);
  const r = emitGlsl(fromLowering(lowering), FIELDS_DIALECT);
  assert.deepEqual(r.diagnostics, [], program.name);
  return { r, lowering, source: /** @type {string} */ (r.source) };
}

for (const program of [swirl, bulge, domainWarp]) {
  test(`${program.name}: the emitted shader and its line map match their goldens`, () => {
    const { r, source } = emitted(program);
    const frag = new URL(`${program.name}.frag`, GOLDEN), map = new URL(`${program.name}.map.txt`, GOLDEN);
    const lines = showLineMap(r.lines, source);
    if (UPDATE) { writeFileSync(frag, source); writeFileSync(map, lines); }
    assert.equal(source, readFileSync(frag, "utf8"));
    assert.equal(lines, readFileSync(map, "utf8"));
  });

  test(`${program.name}: the LIR it lowered through verifies`, () => {
    const { r } = emitted(program);
    assert.deepEqual(verifyLir(/** @type {NonNullable<typeof r.program>} */ (r.program)), []);
  });

  test(`${program.name}: one line map entry per line, each kernel line inside its kernel's source`, () => {
    const { r, source, lowering } = emitted(program);
    assert.equal(r.lines.length, source.split("\n").length - 1, "the source ends with a newline");
    /** @type {Map<string, string>} */
    const srcs = new Map();
    for (const k of [lowering.kernel, ...lowering.helpers.map((h) => h.result.kernel)]) if (k) srcs.set(k.name, k.src);
    for (const e of r.lines) {
      if (e.origin !== "kernel") continue;
      const src = /** @type {string} */ (srcs.get(e.kernel));
      assert.ok(e.span[0] >= 0 && e.span[1] <= src.length, `${e.kernel} ${e.span}`);
    }
  });
}

test("the shader's shape: version, precision, uniforms, output, uv from the fragment coordinate", () => {
  const { source, r } = emitted(domainWarp);
  const lines = source.split("\n");
  assert.deepEqual(lines.slice(0, 3), ["#version 300 es", "precision highp float;", "precision highp int;"]);
  assert.ok(lines.includes("uniform float u_k;"));
  assert.ok(lines.includes("uniform int u_palette;"), "a choice is an index into its options");
  assert.ok(lines.includes("uniform vec2 wb_resolution;"));
  assert.ok(lines.includes("out vec4 wb_color;"));
  assert.ok(lines.includes("  vec2 uv = gl_FragCoord.xy / wb_resolution;"));
  assert.ok(lines.includes("  wb_color = vec4(domain_warp_pixel(uv), 1.0);"));
  assert.deepEqual(r.uniforms.map((u) => [u.glsl, u.param, u.kind]), [
    ["u_t", "t", "float"], ["u_aspect", "aspect", "float"], ["u_k", "k", "float"], ["u_levels", "levels", "float"],
    ["u_scale", "scale", "float"], ["u_palette", "palette", "int"], ["u_seed", "seed", "float"],
  ]);
  assert.deepEqual(r.uniforms.find((u) => u.param === "palette")?.options, ["fog", "grey", "marble"]);
  assert.equal(r.resolution, "wb_resolution");
});

test("the ihash prelude is defined once, before the helpers that call it", () => {
  const { source } = emitted(domainWarp);
  assert.equal(source.split("float ihash(").length, 2);
  assert.ok(source.indexOf("float ihash(") < source.indexOf("float vnoise("));
  assert.ok(source.indexOf("float vnoise(") < source.indexOf("float fbm("));
  assert.ok(source.indexOf("float fbm(") < source.indexOf("vec3 domain_warp_pixel("));
});

test("a sketch's helpers are functions, and a program that does not use fbm does not carry it", () => {
  const { source } = emitted(swirl);
  assert.match(source, /float pmod\(float x, float n\)/);
  assert.match(source, /vec3 grid\(vec2 q\)/);
  assert.doesNotMatch(source, /fbm|ihash/);
});

test("a line of the shader maps back to the lambda's own text", () => {
  const { r, lowering } = emitted(swirl);
  const src = /** @type {string} */ (lowering.kernel?.src);
  const at = r.lines.findIndex((e) => e.origin === "kernel" && src.slice(...e.span).startsWith("dist = length(d)"));
  assert.ok(at >= 0, "the declaration of `dist` has a line");
  const e = /** @type {Extract<typeof r.lines[number], { origin: "kernel" }>} */ (r.lines[at]);
  assert.equal(e.kernel, "swirl.pixel");
  assert.deepEqual(e.start, { line: 5, column: 8 });
});
