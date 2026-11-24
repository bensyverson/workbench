// The pixel debugger's library: one pixel stepped through a lowered fields Program.
import { test } from "node:test";
import assert from "node:assert/strict";
import { lowerField, INTRINSICS } from "../../dialects/fields/index.js";
import { swirl } from "../../dialects/fields/programs/uv-remaps.js";
import { domainWarp } from "../../dialects/fields/programs/domain-warp.js";
import { run } from "../../interp/index.js";
import { tracePixel, groupByLine, finalColor, uniformsFor, pixelUv, pixelOfUv, formatValue, compareColor, glslUniformValues } from "../index.js";

/** @import { Kernel } from "../../ir/ir.js" */

const swirlLowered = lowerField(swirl);
const warpLowered = lowerField(domainWarp);

/**
 * The interpreter's own answer, with no hook.
 * @param {ReturnType<typeof lowerField>} lowering
 * @param {number[]} uv
 * @param {Record<string, unknown>} u
 */
function direct(lowering, uv, u) {
  /** @type {Record<string, Kernel>} */
  const helpers = {};
  for (const h of lowering.helpers) if (h.kind === "fn" && h.result.kernel) helpers[h.name] = h.result.kernel;
  return run(/** @type {Kernel} */ (lowering.kernel), [uv, u], { helpers, intrinsics: INTRINSICS });
}

test("pixelUv samples a pixel's center, y up from the lower left, as the GLSL backend does", () => {
  assert.deepEqual(pixelUv(0, 0, 4, 2), [0.125, 0.25]);
  assert.deepEqual(pixelUv(3, 1, 4, 2), [0.875, 0.75]);
  assert.deepEqual(pixelOfUv([0.875, 0.75], 4, 2), { i: 3, j: 1 });
  assert.deepEqual(pixelOfUv([1, 1], 4, 2), { i: 3, j: 1 });
});

test("uniformsFor takes the Program's defaults, then t and aspect, then overrides", () => {
  const u = uniformsFor(domainWarp, { aspect: 2, k: 6 });
  assert.equal(u.k, 6);
  assert.equal(u.palette, "fog");
  assert.equal(u.aspect, 2);
  assert.equal(u.t, 0);
});

test("the trace's color is the interpreter's own result, and the last return at depth 0", () => {
  const u = uniformsFor(swirl, { aspect: 1 });
  const uv = pixelUv(40, 90, 150, 150);
  const trace = tracePixel(swirlLowered, { uv, uniforms: u });
  assert.deepEqual(trace.result, direct(swirlLowered, uv, u));
  assert.deepEqual(finalColor(trace), trace.result);
  assert.ok(trace.steps.length > 10);
});

test("every step's span lies inside the source of its own kernel, and the text is that slice", () => {
  const trace = tracePixel(swirlLowered, { uv: pixelUv(40, 90, 150, 150), uniforms: uniformsFor(swirl) });
  for (const s of trace.steps) {
    const src = trace.sources[s.kernel];
    assert.ok(src, s.kernel);
    assert.ok(s.span[0] >= 0 && s.span[1] <= src.length && s.span[0] <= s.span[1], `${s.kernel} ${s.path}`);
    assert.equal(s.text, src.slice(s.span[0], s.span[1]));
    assert.equal(s.line, src.slice(0, s.span[0]).split("\n").length);
  }
  assert.ok(trace.steps.some((s) => s.kernel !== swirlLowered.kernel?.name), "grid's steps cite grid's source");
});

test("a step's value is formatted by its type: f32 shortest, vectors whole", () => {
  const trace = tracePixel(swirlLowered, { uv: pixelUv(40, 90, 150, 150), uniforms: uniformsFor(swirl) });
  const c = trace.steps.find((s) => s.depth === 0 && s.path === "body[1].value");
  assert.ok(c);
  assert.equal(c.type, "vec2");
  assert.match(c.shown, /^vec2\(-?[\d.e+-]+, -?[\d.e+-]+\)$/);
  const ret = trace.steps.filter((s) => s.depth === 0 && s.kind === "return").at(-1);
  assert.ok(ret);
  assert.match(ret.shown, /^color\(/);
});

test("formatValue: f32 shortest round trip, f64 as is, bools, enums, vectors", () => {
  assert.equal(formatValue(Math.fround(0.1), "f32"), "0.1");
  assert.equal(formatValue(Math.fround(1 / 3), "f32"), "0.33333334");
  assert.equal(formatValue(1 / 3, "f64"), String(1 / 3));
  assert.equal(formatValue(2, "f32"), "2");
  assert.equal(formatValue(true, "bool"), "true");
  assert.equal(formatValue("fog", { enum: ["fog", "grey"] }), '"fog"');
  assert.equal(formatValue([0.5, 1], { vec: 2, of: "f32", name: "vec2" }), "vec2(0.5, 1)");
  assert.equal(formatValue(NaN, "f32"), "NaN");
  assert.equal(formatValue(undefined, "void"), "");
  assert.equal(formatValue([1, 2], "unknown"), "[1, 2]");
});

test("a helper call appears at depth above 0, and fbm's own kernel is named", () => {
  const u = uniformsFor(domainWarp, { aspect: 1 });
  const trace = tracePixel(warpLowered, { uv: pixelUv(10, 20, 64, 64), uniforms: u });
  assert.deepEqual(trace.result, direct(warpLowered, pixelUv(10, 20, 64, 64), u));
  const deep = trace.steps.filter((s) => s.depth > 0);
  assert.ok(deep.length > 0);
  assert.ok(deep.some((s) => s.kernel.includes("fbm")));
  assert.ok(Math.max(...trace.steps.map((s) => s.depth)) >= 2, "vnoise inside fbm");
  assert.equal(trace.steps.filter((s) => s.depth === 0).every((s) => s.kernel === warpLowered.kernel?.name), true);
});

test("a branch not taken yields no steps: levels 0 never builds q or r", () => {
  const u = uniformsFor(domainWarp, { aspect: 1, levels: 0 });
  const trace = tracePixel(warpLowered, { uv: pixelUv(10, 20, 64, 64), uniforms: u });
  const lets = trace.steps.filter((s) => s.depth === 0 && s.kind === "set").map((s) => s.text);
  assert.ok(lets.every((t) => !t.includes("1.7 + 0.15")), "the levels === 2 branch");
  const full = tracePixel(warpLowered, { uv: pixelUv(10, 20, 64, 64), uniforms: uniformsFor(domainWarp, { aspect: 1, levels: 2 }) });
  assert.ok(full.steps.length > trace.steps.length * 2);
  // An `if` step's span is the whole statement, branches included, so only its inner nodes tell which ran.
  const taken = full.steps.filter((s) => s.depth === 0 && s.kind !== "if").map((s) => s.text).join("\n");
  assert.ok(taken.includes("1.7 + 0.15"));
  const skipped = trace.steps.filter((s) => s.depth === 0 && s.kind !== "if").map((s) => s.text).join("\n");
  assert.ok(!skipped.includes("1.7 + 0.15"));
});

test("groupByLine collects steps by kernel and line, in first-seen order", () => {
  const trace = tracePixel(swirlLowered, { uv: pixelUv(40, 90, 150, 150), uniforms: uniformsFor(swirl) });
  const groups = groupByLine(trace);
  assert.equal(groups.reduce((n, g) => n + g.steps.length, 0), trace.steps.length);
  for (const g of groups) {
    assert.ok(g.steps.every((s) => s.kernel === g.kernel && s.line === g.line));
    assert.equal(g.text, trace.sources[g.kernel].split("\n")[g.line - 1]);
  }
  const keys = groups.map((g) => `${g.kernel}:${g.line}`);
  assert.equal(new Set(keys).size, keys.length);
});

test("steps are numbered in order from 0", () => {
  const trace = tracePixel(swirlLowered, { uv: [0.5, 0.5], uniforms: uniformsFor(swirl) });
  assert.deepEqual(trace.steps.map((s) => s.index), trace.steps.map((_, i) => i));
});

test("a Program that did not lower is refused", () => {
  assert.throws(() => tracePixel({ ...swirlLowered, kernel: null }, { uv: [0, 0], uniforms: {} }), /did not lower/);
});

test("finalColor is null for a trace with no top-level return", () => {
  assert.equal(finalColor({ steps: [], result: undefined, sources: {} }), null);
});

test("compareColor: the interpreter's float color against the GPU's bytes, in 8-bit steps", () => {
  const same = compareColor([0.5, 1, 0], [128, 255, 0, 255]);
  assert.deepEqual(same.expected, [128, 255, 0]);
  assert.deepEqual(same.delta, [0, 0, 0]);
  assert.equal(same.maxDelta, 0);
  const off = compareColor([0.5, 1, 0], [126, 255, 3, 255]);
  assert.deepEqual(off.delta, [-2, 0, 3]);
  assert.equal(off.maxDelta, 3);
  assert.deepEqual(compareColor([2, -1, 0.2], [255, 0, 51, 255]).delta, [0, 0, 0], "the framebuffer clamps");
  assert.deepEqual(compareColor([0.1, 0.2, 0.3, 0.4], [26, 51, 77, 102]).delta, [0, 0, 0, 0], "a vec4 compares its alpha");
});

test("glslUniformValues: u_<name> by kind, a choice as its index, a toggle as 0 or 1", () => {
  const emitted = [
    { glsl: "u_k", param: "k", kind: "float" },
    { glsl: "u_palette", param: "palette", kind: "int", options: ["fog", "grey", "marble"] },
    { glsl: "u_on", param: "on", kind: "bool" },
  ];
  assert.deepEqual(glslUniformValues(emitted, { k: 4, palette: "grey", on: true }), [
    { name: "u_k", kind: "float", value: 4 },
    { name: "u_palette", kind: "int", value: 1 },
    { name: "u_on", kind: "bool", value: 1 },
  ]);
  assert.throws(() => glslUniformValues(emitted, { k: 4, palette: "pink", on: false }), /palette/);
  assert.throws(() => glslUniformValues(emitted, { palette: "fog", on: false }), /'k'/);
});
