// Typed operators in the fields Dialect: what `uv * 2 + vec2(u.t, 0)` means, and what each
// mistake says. Every error names both types and writes the fix.
import { test } from "node:test";
import assert from "node:assert/strict";
import { lowerField, field, VEC2, VEC3, COLOR } from "../index.js";
import { BuildError } from "../../../define/index.js";
import { printKernel } from "../../../ir/print.js";
import { verify } from "../../../ir/verify.js";

/**
 * Lowers `body` as the statements of a pixel lambda that then returns black.
 * @param {string} body
 */
function lowerBody(body) {
  const program = field("probe").param("k", { value: 1 }).param("palette", { value: "a", options: ["a", "b"] }).pixel(`(uv, u) => { ${body}\n return color(0, 0, 0); }`).build();
  return lowerField(program);
}

/** @param {string} body */
function ok(body) {
  const r = lowerBody(body);
  assert.deepEqual(r.diagnostics.map((d) => `${d.code} ${d.message}`), [], body);
  return /** @type {import("../../../ir/ir.js").Kernel} */ (r.kernel);
}

/**
 * @param {string} body
 * @param {string} code
 */
function fails(body, code) {
  const r = lowerBody(body);
  assert.equal(r.kernel, null, body);
  assert.deepEqual(r.diagnostics.map((d) => d.code), [code], `${body}: ${r.diagnostics.map((d) => d.message).join(" | ")}`);
  const d = r.diagnostics[0];
  assert.ok(d.tip && !d.tip.includes("\n"), "a one-line fix");
  return d;
}

test("uv * 2.0 + vec2(u.t, 0) is vector arithmetic, and verifies", () => {
  const k = ok("const q = uv * 2.0 + vec2(u.t, 0);");
  assert.match(printKernel(k), /add\.vec2\(mul\.vec2\(uv, 2\), vec2\(u\.t, 0\)\)/);
  assert.deepEqual(verify(k), []);
  assert.deepEqual(k.locals.find((l) => l.name === "q")?.t, VEC2);
});

test("a bare number literal is an f32 here: let h = 0.5 and h * u.k need no conversion", () => {
  const k = ok("const h = 0.5; const g = h * u.k + 1;");
  assert.equal(k.locals.find((l) => l.name === "g")?.t, "f32");
});

test("vec2 + f32 names both types and writes the vector to add", () => {
  const d = fails("const q = uv + u.k;", "L003");
  assert.match(d.message, /vec2/);
  assert.match(d.message, /f32/);
  assert.match(d.tip, /vec2\(u\.k, u\.k\)/);
});

test("vec2 + a literal too: the literal is an f32, which is not a vec2", () => {
  const d = fails("const q = uv + 1;", "L003");
  assert.match(d.tip, /vec2\(1, 1\)/);
});

test("vec2 * color, and vec3 + color, are different types with the same shape: the tip rebuilds one", () => {
  const a = fails("const q = uv * color(1, 1, 1);", "L003");
  assert.match(a.message, /vec2/);
  assert.match(a.message, /color/);
  const b = fails("const v = vec3(1, 2, 3); const col = color(1, 1, 1); const q = v + col;", "L003");
  assert.match(b.message, /vec3 and color are different types/);
  assert.match(b.tip, /vec3\(col\.x, col\.y, col\.z\)/);
});

test("a scalar minus a vector is an error that builds the vector; a scalar times one is not", () => {
  ok("const q = 2 * uv; const r = uv * 2; const s = uv / 2;");
  const d = fails("const q = 1 - uv;", "L003");
  assert.match(d.tip, /vec2\(1, 1\) - uv/);
  fails("const q = 2 / uv;", "L003");
});

test("== on vectors, an ordering of vectors and % are refused with the components to use", () => {
  assert.match(fails("const q = uv === uv;", "L003").tip, /uv\.x === uv\.x && uv\.y === uv\.y/);
  assert.match(fails("const q = uv < uv;", "L003").tip, /uv\.x|length/);
  fails("const q = uv % 2;", "L003");
});

test("components: x, y on a vec2; r, g, b on a color; nothing else", () => {
  ok("const a = uv.x + uv.y; const c = color(1, 2, 3); const b = c.r + c.g + c.b + c.x;");
  const d = fails("const a = uv.z;", "L002");
  assert.match(d.tip, /x, y/);
  fails("const a = uv.xy;", "L002");
});

test("a component of a let vector is assigned by rebuilding the vector", () => {
  const k = ok("let p = uv; p.x = 0.5; p.y *= 2;");
  assert.match(printKernel(k), /p = vec2\(0\.5, p\.y\)/);
  assert.match(printKernel(k), /p = vec2\(p\.x, mul\.f32\(p\.y, 2\)\)/);
});

test("Math is not here: the intrinsics are typed and named bare", () => {
  // The generated builder refuses a name the lambda cannot see when the Program is built (B008), before
  // lowering's L001, whose tip named the bare intrinsic; B008's tip does not (reported on leaf iJtvVE).
  assert.throws(() => lowerBody("const a = Math.floor(uv.x);"), (/** @type {any} */ e) => e instanceof BuildError && e.code === "B008" && /"Math"/.test(e.message));
});

test("a number past f32's range is L016, not an Infinity", () => {
  fails("const a = uv.x * 1e39;", "L016");
});

test("the intrinsics take their types from their arguments", () => {
  ok("const a = floor(uv); const b = mix(uv, vec2(1, 1), 0.5); const c = clamp(uv.x, 0, 1); const d = length(uv); const e = smoothstep(0, 1, u.k);");
  ok("const f = ihash(1, 2, 3); const g = mix(color(0, 0, 0), color(1, 1, 1), f);");
  const d = fails("const a = mix(uv, color(1, 1, 1), 0.5);", "L003");
  assert.match(d.message, /color/);
  assert.match(d.message, /vec2/);
  fails("const a = length(u.k);", "L003");
  fails("const a = sin(uv);", "L003");
});

test("a pixel lambda must return a color", () => {
  const program = field("probe").pixel("(uv, u) => uv").build();
  const r = lowerField(program);
  assert.equal(r.kernel, null);
  const d = r.diagnostics[0];
  assert.equal(d.code, "L003");
  assert.match(d.message, /vec2/);
  assert.match(d.message, /color/);
  assert.match(d.tip, /color\(/);
});

test("a param is read as u.name, with the type its declaration gives", () => {
  const k = ok("const a = u.k * 2; const b = u.palette === \"b\"; const c = u.aspect + u.t;");
  assert.equal(k.locals.find((l) => l.name === "b")?.t, "bool");
  const bad = fails("const a = u.nope;", "L002");
  assert.match(bad.tip, /k, palette/);
  fails("u.k = 2;", "L013");
  assert.ok(VEC3 && COLOR);
});
