import { test } from "node:test";
import assert from "node:assert/strict";
import { prepare, uniformValues } from "../pipeline.js";
import { evaluateGrid } from "../evaluate.js";
import { locate } from "../locate.js";
import { standardCases } from "../cases.js";
import { compare } from "../compare.js";

const [swirlCase, , warpCase] = standardCases(0.1);

test("the standard cases have the grid and sets the findings record at full size", () => {
  const full = standardCases();
  assert.deepEqual(full.map((c) => [c.name, c.width, c.height, c.sets.length]), [["swirl", 150, 150, 3], ["bulge", 150, 150, 3], ["domain-warp", 132, 90, 9]]);
  for (const c of full) for (const s of c.sets) assert.equal(s.values.aspect, c.width / c.height, `${c.name}: aspect is width over height`);
});

test("a pixel is sampled at its center, y up", () => {
  /** @type {number[][]} */
  const seen = [];
  evaluateGrid((uv) => { seen.push(uv); return [0, 0, 0]; }, 4, 2, {});
  assert.deepEqual(seen[0], [0.125, 0.25]);
  assert.deepEqual(seen[3], [0.875, 0.25]);
  assert.deepEqual(seen[4], [0.125, 0.75]);
});

test("the JS function and the interpreter agree bit for bit on a grid", () => {
  const p = prepare(swirlCase.program);
  for (const s of swirlCase.sets) {
    const { host } = uniformValues(p, s.values);
    const ref = evaluateGrid((uv, u) => p.interp(uv, u), swirlCase.width, swirlCase.height, host);
    const js = evaluateGrid((uv, u) => p.js(uv, u), swirlCase.width, swirlCase.height, host);
    const r = compare([ref], [js], { width: swirlCase.width, height: swirlCase.height, labels: [s.label] }, 0);
    assert.equal(r.exact, true, s.label);
  }
});

test("a choice goes to the shader as its option's index and stays a name for the host", () => {
  const p = prepare(warpCase.program);
  const values = { ...warpCase.sets[0].values, palette: "marble", levels: 2 };
  const { host, gl } = uniformValues(p, values);
  assert.equal(host.palette, "marble");
  assert.equal(gl.u_palette, 2);
  assert.equal(gl.u_levels, 2);
  assert.throws(() => uniformValues(p, { ...values, palette: "neon" }), /not an option/);
  const { palette: _drop, ...rest } = values;
  assert.throws(() => uniformValues(p, rest), /no value for uniform 'palette'/);
});

test("locate finds the return that made a pixel, in the author's lambda, the emitted JS and the shader", () => {
  const p = prepare(swirlCase.program);
  const { host } = uniformValues(p, swirlCase.sets[0].values);
  const at = locate(p, [0, 0], swirlCase.width, swirlCase.height, host);
  assert.equal(at.kernel, "swirl.pixel");
  assert.equal(at.text, "return grid(d + c);");
  assert.equal(at.line, 13);
  assert.match(p.jsEmitted.source.split("\n")[at.jsLine - 1], /return/);
  assert.match(String(p.glsl.source).split("\n")[at.glslLine - 1], /return/);
});

test("locate follows the branch a pixel took", () => {
  const p = prepare(warpCase.program);
  const run = (/** @type {string} */ palette) => locate(p, [1, 1], warpCase.width, warpCase.height, uniformValues(p, { ...warpCase.sets[0].values, palette }).host);
  assert.match(run("grey").text, /return color\(g, g, g\)/);
  assert.match(run("fog").text, /return mix\(B, c, f \* f \* f/);
  assert.match(run("marble").text, /return mix\(c, H, 0.9 \* vein\)/);
});

test("a planted fault says whether it changed anything of its target", () => {
  assert.equal(prepare(swirlCase.program).planted, false);
  assert.equal(prepare(swirlCase.program, { target: "js", text: (s) => s.replace("Math.sin", "Math.cos") }).planted, true);
  assert.equal(prepare(swirlCase.program, { target: "js", text: (s) => s.replace("nothing like this", "x") }).planted, false);
  assert.equal(prepare(swirlCase.program, { target: "glsl", text: (s) => s.replace("sin(", "cos(") }).planted, true);
  assert.equal(prepare(swirlCase.program, { target: "glsl", ir: () => {} }).planted, false);
});
