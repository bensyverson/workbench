// Regression tests from the second review (the fields Dialect): loop bounds follow the counter's
// number type, mixed number types inside lists and structs, read-only places as bounds,
// untyped array and struct constants, `a.x++` as a value, and a component assignment's value.
import { test } from "node:test";
import assert from "node:assert/strict";
import { lowerLambda, lowerProgram } from "../index.js";
import { dialectVector } from "../../ir/types.js";
import { printKernel } from "../../ir/print.js";
import { verify } from "../../ir/verify.js";

/** @import { Environment, SlotRef } from "../environment.js" */

const VEC2 = dialectVector("vec2", 2, "f32");
const COLOR = dialectVector("color", 3, "f32");
const DV = dialectVector("dvec2", 2, "f64");
/** @type {Environment} */
const env = {
  name: "review2 (test)",
  objects: { U: { label: "the uniforms", members: { n: { kind: "value", t: "f32" }, cap: { kind: "value", t: "f32", size: true } } } },
  list: {},
  queries: [],
  globals: {},
  vectors: { vec2: VEC2, color: COLOR, dvec2: DV },
  conversions: { f32: "f32", f64: "f64" },
  numberType: "f32",
  slot: (ref) => (ref.kind === "const"
    ? { params: [], returns: "infer", space: "const", forbid: [] }
    : { params: [VEC2, "f32", "f64", "bool", COLOR, DV, { obj: "U" }], returns: "infer", space: "pixel", forbid: [] }),
};
const plain = { ...env, numberType: undefined };
const slot = /** @type {SlotRef} */ ({ id: "p.pixel", kind: "pixel", on: "p" });
const P = "(uv, k, d, b, c, dv, u) =>";
/** @param {string} src @param {Environment} [e] */
const lower = (src, e = env) => lowerLambda(e, `${P} ${src}`, slot);
/** @param {string} src @param {Environment} [e] */
const codes = (src, e = env) => lower(src, e).diagnostics.map((d) => d.code);

test("an f32 counter's constant bound must be one it reaches: 2^24 - 1 at most", () => {
  assert.deepEqual(codes("{ let s = 0; for (let i = 0; i < 20000000; i++) { s += 1; } return s; }"), ["L007"]);
  assert.deepEqual(codes("{ let s = 0; for (let i = 0; i < 16777217; i++) { s += 1; } return s; }"), ["L007"]);
  assert.deepEqual(codes("{ let s = 0; for (let i = 0; i <= 16777216; i++) { s += 1; } return s; }"), ["L007"]);
  assert.deepEqual(codes("{ let s = 0; for (let i = 0; i < 16777215; i++) { s += 1; } return s; }"), []);
  assert.deepEqual(codes("{ let s = 0; for (let i = 0; i < 300; i++) { s += 1; } return s; }"), []);
});

test("an f32 counter's start must be one it holds exactly", () => {
  assert.deepEqual(codes("{ let s = 0; for (let i = -16777217; i < 0; i++) { s += 1; } return s; }"), ["L007"]);
  assert.deepEqual(codes("{ let s = 0; for (let i = -16777215; i < 0; i++) { s += 1; } return s; }"), []);
});

test("an f64 counter keeps the 2^53 limit", () => {
  assert.deepEqual(codes("{ let s = 0; for (let i = 0; i < 20000000; i++) { s += 1; } return s; }", plain), []);
  assert.deepEqual(codes("{ let s = 0; for (let i = 0; i <= 9007199254740993; i++) { s += 1; } return s; }", plain), ["L007"]);
});

test("a declared size (a place the Dialect flags) bounds a loop; a plain read-only uniform does not", () => {
  assert.deepEqual(codes("{ let s = 0; for (let i = 0; i < u.n; i++) { s += 1; } return s; }"), ["L007"]);
  const r = lower("{ let s = 0; for (let i = 0; i < u.cap; i++) { s += 1; } return s; }");
  assert.deepEqual(r.diagnostics.map((d) => d.code), []);
  assert.deepEqual(verify(/** @type {import("../../ir/ir.js").Kernel} */ (r.kernel)), []);
});

for (const src of ["b ? [k] : [d]", "b ? { a: k } : { a: d }", "{ if (b) return [k]; return [d]; }", "{ if (b) return { a: uv }; return { a: c }; }", "{ if (b) return { a: [k] }; return { a: [d] }; }"]) {
  test(`two number types inside a list or struct do not join: ${src}`, () => {
    assert.deepEqual(codes(src), ["L003"]);
  });
}

test("the same item type in two lists or structs still joins", () => {
  assert.deepEqual(codes("b ? [k, k] : [k]"), []);
  assert.deepEqual(codes("b ? { a: k } : { a: k }"), []);
});

test("the verifier refuses a union of lists of two number types", () => {
  const r = lower("b ? [k] : [k]");
  const kernel = /** @type {import("../../ir/ir.js").Kernel} */ (r.kernel);
  /** @type {import("../../ir/ir.js").Type} */
  const bad = { union: [{ list: "f32", max: 4 }, { list: "f64", max: 4 }] };
  const result = verify({ ...kernel, returns: bad });
  assert.deepEqual(result.map((d) => d.code), ["V003"]);
  const fine = verify({ ...kernel, returns: { union: [{ list: "f64", max: 4 }, "str"] } });
  assert.ok(!fine.some((d) => d.code === "V003"), "a union without an f32 or vector is M1's, and stays allowed");
});

test("a baked array or struct constant stays untyped until each use", () => {
  /** @param {string} src @param {string} use */
  const run = (src, use) => lowerProgram(env, [{ src: `${P} ${use}`, slot }], [{ name: "A", kind: "const", src }]).results[0].diagnostics.map((x) => x.code);
  assert.deepEqual(run("0.5", "A * d"), []);
  assert.deepEqual(run("[0.5, 1]", "A[0] * d"), []);
  assert.deepEqual(run("[0.5, 1]", "A[0] * k"), []);
  assert.deepEqual(run("({ h: 0.5 })", "A.h * d"), []);
  assert.deepEqual(run("({ h: 0.5 })", "A.h * k"), []);
});

test("a.x++ and ++a.x as values lower: postfix yields the old component, prefix the new", () => {
  for (const src of ["{ let a = uv; const y = a.x++; return y + a.x; }", "{ let a = uv; const y = ++a.x; return y + a.x; }", "{ let a = uv; const y = a.y--; return y; }"]) {
    const r = lower(src);
    assert.deepEqual(r.diagnostics.map((d) => `${d.code} ${d.message}`), [], src);
  }
  const post = printKernel(/** @type {import("../../ir/ir.js").Kernel} */ (lower("{ let a = uv; const y = a.x++; return y; }").kernel));
  const pre = printKernel(/** @type {import("../../ir/ir.js").Kernel} */ (lower("{ let a = uv; const y = ++a.x; return y; }").kernel));
  assert.notEqual(post, pre);
  assert.deepEqual(codes("{ const a = uv; const y = a.x++; return y; }"), ["L013"]);
});

test("the value of a component assignment is a settled value of the component's type", () => {
  assert.deepEqual(codes("{ let a = dv; return k * (a.x = 0.5); }"), ["L003"]);
  assert.deepEqual(codes("{ let a = dv; return d * (a.x = 0.5); }"), []);
  assert.deepEqual(codes("{ let a = uv; return k * (a.x = 0.5); }"), []);
  const r = lower("{ let a = uv; return k * (a.x = 0.5); }");
  assert.match(printKernel(/** @type {import("../../ir/ir.js").Kernel} */ (r.kernel)), /0\.5/);
});
