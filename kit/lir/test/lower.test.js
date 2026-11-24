// Lowering the core IR to the LIR: what the target cannot leave implicit becomes explicit, and
// what it cannot take is refused with a diagnostic.
import { test } from "node:test";
import assert from "node:assert/strict";
import { lowerToLir, verifyLir } from "../index.js";
import * as c from "../../interp/test/build.js";

/** @import { Type } from "../../ir/ir.js" */
/** @import { Spelling } from "../lir.js" */

const VEC2 = /** @type {Type} */ ({ vec: 2, of: "f32", name: "vec2" });
const U = /** @type {Type} */ ({ obj: "Uniforms" });
const COLORS = /** @type {Type} */ ({ enum: ["fog", "grey", "marble"], declared: true });

/** @type {Record<string, Spelling>} */
const SPELLINGS = {
  sin: { call: "sin($0)" },
  twice: { call: "twice($0)", prelude: "float twice(float x) { return 2.0 * x; }\n" },
};
/** @param {string} fn */
const spell = (fn) => SPELLINGS[fn] ?? null;

const UNIFORMS = { Uniforms: { a: /** @type {Type} */ ("f32"), b: /** @type {Type} */ ("f64"), on: /** @type {Type} */ ("bool"), palette: COLORS } };
const uni = (/** @type {string} */ name, /** @type {Type} */ t) => c.load(c.place(c.local("u", U), "Uniforms", name, t));

/** @param {import("../../ir/ir.js").Kernel} main @param {import("../../ir/ir.js").Kernel[]} [helpers] */
const lower = (main, helpers = []) => lowerToLir({ name: "t", main, helpers, uniforms: UNIFORMS }, { spell });

/** Lowers `main` and expects a program. @param {import("../../ir/ir.js").Kernel} main */
function ok(main, helpers = /** @type {import("../../ir/ir.js").Kernel[]} */ ([])) {
  const r = lower(main, helpers);
  assert.deepEqual(r.diagnostics, []);
  return /** @type {NonNullable<typeof r.program>} */ (r.program);
}

/** The diagnostics' codes of lowering `main`. @param {import("../../ir/ir.js").Kernel} main */
const refused = (main, helpers = /** @type {import("../../ir/ir.js").Kernel[]} */ ([])) => {
  const r = lower(main, helpers);
  assert.equal(r.program, null);
  return [...new Set(r.diagnostics.map((d) => d.code))];
};

test("operators, vectors, a swizzle and an intrinsic lower to LIR that verifies", () => {
  const x = c.local("x", "f32");
  const k = c.kernel({ name: "k#0", params: [["x", "f32"], ["v", VEC2]], returns: "f32", body: [
    c.ret(c.op("add", "f32", c.op("mul", "f32", x, c.f32(2)), c.call("sin", "f32", [c.field(c.op("mul", VEC2, c.f32(2), c.local("v", VEC2)), "x", "f32")]))),
  ] });
  const p = ok(k);
  assert.deepEqual(verifyLir(p), []);
  const [x1, v1] = p.main.params;
  assert.deepEqual([x1.t, v1.t], ["f32", { vec: 2 }], "a Dialect vector is a plain vec2");
  const ret = /** @type {any} */ (p.main.body[0]);
  assert.equal(ret.value.op, "add");
  assert.equal(ret.value.args[1].k, "call");
  assert.deepEqual(ret.value.args[1].spelling, { call: "sin($0)" }, "the intrinsic is bound to its spelling");
  assert.equal(ret.value.args[1].args[0].k, "swizzle");
});

test("names become legal identifiers: reserved words, dashes and the kernel's own name", () => {
  const k = c.kernel({ name: "domain-warp.pixel", params: [["sample", "f32"]], returns: "f32", body: [
    c.let_("float", "f32", c.local("sample", "f32")), c.let_("a__b", "f32", c.local("float", "f32")), c.ret(c.local("a__b", "f32")),
  ] });
  const p = ok(k);
  assert.equal(p.main.name, "domain_warp_pixel");
  assert.equal(p.main.source, "domain-warp.pixel");
  assert.deepEqual(p.main.params.map((x) => x.name), ["sample_"]);
  assert.deepEqual(p.main.locals.map((x) => x.name), ["float_", "a_b"]);
  assert.deepEqual(verifyLir(p), []);
});

test("a choice uniform is an i32, and comparing it to an option compares ordinals", () => {
  const k = c.kernel({ name: "k#0", params: [["u", U]], returns: "f32", body: [
    c.if_(c.op("eq", "bool", uni("palette", COLORS), c.str("grey")), [c.ret(c.f32(1))]),
    c.ret(c.f32(0)),
  ] });
  const p = ok(k);
  const palette = /** @type {NonNullable<(typeof p.uniforms)[number]>} */ (p.uniforms.find((u) => u.source === "palette"));
  assert.equal(palette.t, "i32");
  assert.deepEqual(palette.options, ["fog", "grey", "marble"]);
  const test = /** @type {any} */ (p.main.body[0]).test;
  assert.deepEqual([test.op, test.args[0].k, test.args[0].t, test.args[1].k, test.args[1].t, test.args[1].v], ["eq", "uniform", "i32", "num", "i32", 1]);
  assert.deepEqual(p.main.params, [], "the uniforms parameter is not a parameter of the function");
});

test("uniforms: a bool stays a bool, an f64 is declared with its host type and narrowed where it is read", () => {
  const k = c.kernel({ name: "k#0", params: [["u", U]], returns: "f32", body: [
    c.if_(uni("on", "bool"), [c.ret(c.op("f32", "f32", uni("b", "f64")))]),
    c.ret(uni("a", "f32")),
  ] });
  const p = ok(k);
  assert.deepEqual(p.uniforms.map((u) => [u.source, u.t, u.host ?? null]), [["a", "f32", null], ["b", "f32", "f64"], ["on", "bool", null], ["palette", "i32", null]]);
  assert.deepEqual(p.uniforms.map((u) => u.name), ["u_a", "u_b", "u_on", "u_palette"]);
});

test("an f64 literal is narrowed explicitly, by the f32 conversion that asks for it", () => {
  const p = ok(c.kernel({ name: "k#0", returns: "f32", body: [c.ret(c.op("f32", "f32", c.num(0.1)))] }));
  assert.deepEqual(/** @type {any} */ (p.main.body[0]).value, { k: "num", v: Math.fround(0.1), t: "f32", span: [0, 1] });
});

test("R001: f64 arithmetic, an f64 local or an f64 return is refused: the meaning depends on f64 precision", () => {
  assert.deepEqual(refused(c.kernel({ name: "k#0", returns: "f64", body: [c.ret(c.op("add", "f64", c.num(1), c.num(2)))] })), ["R001"]);
  assert.deepEqual(refused(c.kernel({ name: "k#0", returns: "f32", body: [c.ret(c.op("f32", "f32", c.op("add", "f64", c.num(1), c.num(2))))] })), ["R001"], "narrowing the sum does not make the sum f32");
  assert.deepEqual(refused(c.kernel({ name: "k#0", returns: "f32", body: [c.let_("x", "f64", c.num(1)), c.ret(c.op("f32", "f32", c.local("x", "f64")))] })), ["R001"], "an f64 local");
  assert.deepEqual(refused(c.kernel({ name: "k#0", returns: "f32", body: [c.ret(c.op("f32", "f32", c.num(1e300)))] })), ["R001"], "a literal out of f32's range");
  assert.deepEqual(refused(c.kernel({ name: "k#0", params: [["x", "f64"]], returns: "f32", body: [c.ret(c.op("f32", "f32", c.local("x", "f64")))] })), ["R001"], "an f64 parameter");
});

test("R001 names the f64 operation, its place in the lambda, and the way out", () => {
  const r = lower(c.kernel({ name: "k#0", returns: "f64", body: [c.ret(c.op("add", "f64", c.num(1), c.num(2)))] }));
  assert.match(r.diagnostics[0].message, /f64/);
  assert.match(r.diagnostics[0].message, /GLSL ES 3\.00 has no f64/);
  assert.equal(r.diagnostics[0].kernel, "k#0");
  assert.deepEqual(r.diagnostics[0].span, [0, 1]);
});

test("R002: a value with no form in the LIR (a string, a list, an entity) is refused", () => {
  assert.deepEqual(refused(c.kernel({ name: "k#0", returns: "str", body: [c.ret(c.str("hi"))] })), ["R002"]);
  assert.deepEqual(refused(c.kernel({ name: "k#0", params: [["l", { list: "f32", max: 3 }]], returns: "f32", body: [c.ret(c.f32(1))] })), ["R002"]);
  const listed = c.kernel({ name: "k#0", returns: "f32", body: [c.ret(c.index(c.array([c.f32(1)], "f32"), c.num(0), "f32"))] });
  assert.ok(refused(listed).every((code) => code === "R002"));
});

test("R003: an intrinsic with no spelling is refused", () => {
  assert.deepEqual(refused(c.kernel({ name: "k#0", returns: "f32", body: [c.ret(c.call("nosuch", "f32", [c.f32(1)]))] })), ["R003"]);
});

test("an intrinsic's prelude is carried once however often it is used", () => {
  const twice = (/** @type {number} */ n) => c.call("twice", "f32", [c.f32(n)]);
  const p = ok(c.kernel({ name: "k#0", returns: "f32", body: [c.ret(c.op("add", "f32", twice(1), twice(2)))] }));
  assert.deepEqual(p.preludes, [{ name: "twice", text: "float twice(float x) { return 2.0 * x; }\n" }]);
});

test("R006: rem is refused on f32, since GLSL cannot reproduce JavaScript's %, and the tip names pmod", () => {
  const k = c.kernel({ name: "k#0", params: [["x", "f32"]], returns: "f32", body: [c.ret(c.op("rem", "f32", c.local("x", "f32"), c.f32(3)))] });
  assert.deepEqual(refused(k), ["R006"]);
  const message = lower(k).diagnostics[0].message;
  assert.match(message, /pmod/);
  assert.match(message, /%/);
});

test("pow is written out, and truthy of an f32 is false for NaN as in JavaScript", () => {
  const p = ok(c.kernel({ name: "k#0", params: [["x", "f32"]], returns: "bool", body: [c.ret(c.op("truthy", "bool", c.op("pow", "f32", c.local("x", "f32"), c.f32(2))))] }));
  const e = /** @type {any} */ (p.main.body[0]).value;
  assert.deepEqual([e.k, e.name, e.args[0].k, e.args[0].name], ["call", "truthy", "call", "pow"]);
  assert.match(e.spelling.prelude, /isnan/, "NaN is tested for, not only zero");
  assert.deepEqual(p.preludes.map((x) => x.name), ["truthy"]);
  assert.deepEqual(verifyLir(p), []);
});

test("R002: comparing two choices whose options differ compares ordinals of different lists, and is refused", () => {
  const other = /** @type {Type} */ ({ enum: ["marble", "grey", "fog"], declared: true });
  const same = /** @type {Type} */ ({ enum: ["fog", "grey", "marble"], declared: true });
  const mk = (/** @type {Type} */ bt) => c.kernel({ name: "k#0", params: [["u", U]], returns: "f32", body: [
    c.if_(c.op("eq", "bool", uni("palette", COLORS), uni("other", bt)), [c.ret(c.f32(1))]),
    c.ret(c.f32(0)),
  ] });
  const lowerWith = (/** @type {Type} */ bt) => lowerToLir({ name: "t", main: mk(bt), helpers: [], uniforms: { Uniforms: { ...UNIFORMS.Uniforms, other: bt } } }, { spell });
  const bad = lowerWith(other);
  assert.equal(bad.program, null);
  assert.deepEqual(bad.diagnostics.map((d) => d.code), ["R002"]);
  assert.match(bad.diagnostics[0].message, /options/);
  const good = lowerWith(same);
  assert.deepEqual(good.diagnostics, [], "the same options in the same order compare as ordinals");
  assert.ok(good.program);
});

test("helpers come out callee first, only the ones the kernel reaches, and a constant kernel is not one", () => {
  const leaf = c.kernel({ name: "leaf", params: [["x", "f32"]], returns: "f32", body: [c.ret(c.local("x", "f32"))] });
  const mid = c.kernel({ name: "mid", params: [["x", "f32"]], returns: "f32", body: [c.ret(c.helper("leaf", "f32", [c.local("x", "f32")]))] });
  const unused = c.kernel({ name: "unused", returns: "f32", body: [c.ret(c.f32(1))] });
  const main = c.kernel({ name: "k#0", returns: "f32", body: [c.ret(c.helper("mid", "f32", [c.f32(1)]))] });
  const p = ok(main, [unused, mid, leaf]);
  assert.deepEqual(p.helpers.map((h) => h.name), ["leaf", "mid"]);
  assert.deepEqual(verifyLir(p), []);
});

test("R004: a helper that is not given, or that calls itself", () => {
  assert.deepEqual(refused(c.kernel({ name: "k#0", returns: "f32", body: [c.ret(c.helper("ghost", "f32", []))] })), ["R004"]);
  const r = c.kernel({ name: "r", params: [["x", "f32"]], returns: "f32", body: [c.ret(c.helper("r", "f32", [c.local("x", "f32")]))] });
  const main = c.kernel({ name: "k#0", returns: "f32", body: [c.ret(c.helper("r", "f32", [c.f32(1)]))] });
  assert.deepEqual(refused(main, [r]), ["R004"], "GLSL has no recursion");
});

test("R005: a uniform the program does not declare is refused", () => {
  const k = c.kernel({ name: "k#0", params: [["u", U]], returns: "f32", body: [c.ret(uni("nope", "f32"))] });
  assert.deepEqual(refused(k), ["R005"]);
});

test("a store is refused: nothing in a shader holds state", () => {
  const k = c.kernel({ name: "k#0", params: [["self", { ref: "Mole" }]], returns: "void", body: [c.store(c.place(c.local("self", { ref: "Mole" }), "Mole", "x", "f64", { type: "f64" }), c.num(1))] });
  assert.ok(refused(k).length > 0);
});

test("a diagnostic for every problem, not only the first", () => {
  const k = c.kernel({ name: "k#0", returns: "f32", body: [c.let_("a", "f32", c.call("nosuch", "f32", [])), c.let_("b", "f32", c.helper("ghost", "f32", [])), c.ret(c.local("a", "f32"))] });
  assert.deepEqual(refused(k), ["R003", "R004"]);
});
