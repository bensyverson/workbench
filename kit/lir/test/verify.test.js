// The LIR verifier: a valid program passes, and each broken invariant is reported under its own code.
import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyLir, LIR_CODES } from "../index.js";
import { kernel, program, f32, i32, bool, local, uniform, op, conv, call, helper, vec, swizzle, cond, let_, set, if_, for_, ret, brk, uniformDecl, VEC2 } from "./build.js";

/** @param {import("../lir.js").LProgram} p @returns {string[]} */
const codes = (p) => verifyLir(p).map((d) => d.code);

/** A program whose main is `body`, with a uniform `u_a` (f32) and `u_n` (i32). */
const withMain = (/** @type {import("../lir.js").LStmt[]} */ body, returns = /** @type {import("../lir.js").LType} */ ("f32")) =>
  program({ main: kernel({ name: "main_", params: [["uv", VEC2]], returns, body }), uniforms: [uniformDecl("u_a"), uniformDecl("u_n", "i32")] });

test("a valid program verifies clean, and every code is documented", () => {
  const p = program({
    main: kernel({ name: "main_", params: [["uv", VEC2]], returns: "f32", body: [
      let_("x", "f32", op("mul", "f32", swizzle(local("uv", VEC2), "x"), uniform("u_a"))),
      for_("i", 3, [set("x", op("add", "f32", local("x"), call("sin", "sin($0)", "f32", [local("i")])))]),
      if_(op("eq", "bool", uniform("u_n", "i32"), i32(2)), [set("x", conv("f32", uniform("u_n", "i32")))]),
      ret(cond(op("lt", "bool", local("x"), f32(0)), helper("h", "f32", [local("x")]), local("x"))),
    ] }),
    helpers: [kernel({ name: "h", params: [["a", "f32"]], body: [ret(op("neg", "f32", local("a")))] })],
    uniforms: [uniformDecl("u_a"), uniformDecl("u_n", "i32")],
  });
  assert.deepEqual(verifyLir(p), []);
  assert.deepEqual(Object.keys(LIR_CODES), ["W001", "W002", "W003", "W004", "W005", "W006", "W007", "W008", "W009", "W010", "W011"]);
});

test("W001: a node of no known kind", () => {
  const bad = /** @type {any} */ ({ k: "banana", t: "f32", span: [0, 1] });
  assert.deepEqual(codes(withMain([ret(bad)])), ["W001"]);
});

test("W001: a node missing a field its kind has", () => {
  const bad = /** @type {any} */ ({ k: "op", op: "add", t: "f32", span: [0, 1] });
  assert.deepEqual(codes(withMain([ret(bad)])), ["W001"]);
});

test("W002: an operator whose operands or result type do not fit", () => {
  assert.deepEqual(codes(withMain([ret(op("add", "f32", f32(1), i32(1)))])), ["W002"], "f32 and i32 never mix");
  assert.deepEqual(codes(withMain([ret(op("add", "bool", f32(1), f32(1)))])), ["W002"], "an f32 sum is an f32");
  assert.deepEqual(codes(withMain([ret(op("div", "f32", i32(1), i32(1)))])), ["W002"], "i32 has no arithmetic");
  assert.deepEqual(codes(withMain([ret(op("add", VEC2, local("uv", VEC2), f32(1)))])), ["W002"], "add takes no scalar beside a vector");
  assert.deepEqual(codes(withMain([ret(cond(f32(1), f32(1), f32(2)))])), ["W002"], "a condition is a bool");
  assert.deepEqual(codes(withMain([ret(swizzle(local("uv", VEC2), "z"))])), ["W002"], "a vec2 has no z");
  assert.deepEqual(codes(withMain([ret(vec(f32(1), i32(1)))])), ["W002"], "a vector is of f32s");
  assert.deepEqual(codes(withMain([ret(conv("f32", f32(1)))])), ["W002"], "a conversion changes the type");
  assert.deepEqual(codes(withMain([ret(conv("bool", f32(1)))])), ["W002"], "a conversion is between f32 and i32");
  assert.deepEqual(codes(withMain([ret(bool(true))])), ["W002"], "a return agrees with the declared type");
});

test("W002: operators that must still verify", () => {
  const ok = [
    op("mul", VEC2, f32(2), local("uv", VEC2)), op("div", VEC2, local("uv", VEC2), f32(2)), op("eq", "bool", local("uv", VEC2), local("uv", VEC2)),
    op("lt", "bool", i32(1), i32(2)), op("and", "bool", bool(true), op("not", "bool", bool(false))), op("neg", VEC2, local("uv", VEC2)),
  ];
  for (const e of ok) assert.deepEqual(codes(withMain([let_("v", e.t, e), ret(f32(0))])), [], JSON.stringify(e.k + e.t));
});

test("W003: a type or literal the LIR cannot hold", () => {
  assert.deepEqual(codes(withMain([ret(/** @type {any} */ ({ k: "num", v: 1, t: "f64", span: [0, 1] }))])), ["W003"], "no f64");
  assert.deepEqual(codes(withMain([ret(/** @type {any} */ ({ k: "num", v: 0.1, t: "f32", span: [0, 1] }))])), ["W003"], "an f32 literal is already rounded");
  assert.deepEqual(codes(withMain([ret(/** @type {any} */ ({ k: "num", v: 1.5, t: "i32", span: [0, 1] }))])), ["W003"], "an i32 literal is whole");
  assert.deepEqual(codes(withMain([ret(/** @type {any} */ ({ k: "num", v: Infinity, t: "f32", span: [0, 1] }))])), ["W003"], "finite");
  assert.deepEqual(codes(withMain([ret(/** @type {any} */ ({ k: "num", v: 2 ** 31, t: "i32", span: [0, 1] }))])), ["W003"], "an i32 literal is in range");
  assert.deepEqual(codes(withMain([let_("v", /** @type {any} */ ("f64"), null), ret(f32(0))])), ["W003"], "no f64 local");
});

test("W004: a name used before it is bound, or bound twice", () => {
  assert.deepEqual(codes(withMain([ret(local("nope"))])), ["W004"]);
  assert.deepEqual(codes(withMain([let_("x", "f32", f32(1)), let_("x", "f32", f32(2)), ret(local("x"))])), ["W004"], "twice");
  assert.deepEqual(codes(withMain([if_(bool(true), [let_("x", "f32", f32(1))]), ret(local("x"))])), ["W004"], "out of its block");
  assert.deepEqual(codes(withMain([let_("uv", VEC2, local("uv", VEC2)), ret(f32(0))])), ["W004"], "a local never reuses a parameter's name");
});

test("W005: an assignment that cannot be made", () => {
  assert.deepEqual(codes(withMain([set("uv", local("uv", VEC2)), ret(f32(0))])), ["W005"], "a parameter is not assigned");
  assert.deepEqual(codes(withMain([let_("x", "f32", f32(1)), set("x", i32(1)), ret(local("x"))])), ["W005"], "the value has the local's type");
  assert.deepEqual(codes(withMain([set("nope", f32(1)), ret(f32(0))])), ["W004"], "an unbound name is W004");
});

test("W006: break outside a loop, a for that is not shaped as a loop", () => {
  assert.deepEqual(codes(withMain([brk, ret(f32(0))])), ["W006"]);
  const loop = /** @type {any} */ (for_("i", 2, []));
  loop.test = f32(1);
  assert.deepEqual(codes(withMain([loop, ret(f32(0))])), ["W002"], "a loop's test is a bool");
  const unbounded = /** @type {any} */ (for_("i", 2, []));
  unbounded.bound = "";
  assert.deepEqual(codes(withMain([unbounded, ret(f32(0))])), ["W006"], "a loop names its bound");
});

test("W007: a call that does not match what it calls, a uniform not declared", () => {
  assert.deepEqual(codes(withMain([ret(helper("nope", "f32", []))])), ["W007"], "unknown helper");
  const p = program({ main: kernel({ name: "m", returns: "f32", body: [ret(helper("h", "f32", [i32(1)]))] }), helpers: [kernel({ name: "h", params: [["a", "f32"]], body: [ret(local("a"))] })] });
  assert.deepEqual(codes(p), ["W007"], "argument types");
  assert.deepEqual(codes(withMain([ret(uniform("u_missing"))])), ["W007"], "undeclared uniform");
  assert.deepEqual(codes(withMain([ret(uniform("u_a", "i32"))])), ["W007"], "a uniform read at its declared type");
});

test("W008: helpers out of order, or recursive", () => {
  const a = kernel({ name: "a", params: [["x", "f32"]], body: [ret(helper("b", "f32", [local("x")]))] });
  const b = kernel({ name: "b", params: [["x", "f32"]], body: [ret(local("x"))] });
  const main = kernel({ name: "m", body: [ret(helper("a", "f32", [f32(1)]))] });
  assert.deepEqual(codes(program({ main, helpers: [b, a] })), []);
  assert.deepEqual(codes(program({ main, helpers: [a, b] })), ["W008"], "a calls b, which is declared later");
  const r = kernel({ name: "r", params: [["x", "f32"]], body: [ret(helper("r", "f32", [local("x")]))] });
  assert.deepEqual(codes(program({ main: kernel({ name: "m", body: [ret(helper("r", "f32", [f32(1)]))] }), helpers: [r] })), ["W008"], "recursion");
});

test("W009: a node without a span inside the source", () => {
  const e = /** @type {any} */ (f32(1));
  e.span = [0, 9999];
  assert.deepEqual(codes(withMain([ret(e)])), ["W009"]);
  const s = /** @type {any} */ (ret(f32(1)));
  delete s.span;
  assert.deepEqual(codes(withMain([s])), ["W009"]);
});

test("W010: a name that is not a legal identifier in the target", () => {
  for (const bad of ["domain-warp", "1x", "gl_x", "a__b", "float", "sample", "u_clash"]) {
    const p = program({ main: kernel({ name: "m", body: [let_(bad, "f32", f32(1)), ret(local(bad))] }) });
    assert.deepEqual(codes(p), ["W010"], bad);
  }
  assert.deepEqual(codes(program({ main: kernel({ name: "float", body: [ret(f32(1))] }) })), ["W010"], "a function name too");
});

test("W011: a prelude missing for an intrinsic that needs one, or one nobody uses", () => {
  const body = [ret(call("ihash", "ihash($0)", "f32", [f32(1)], "float ihash(float x) { return x; }\n"))];
  assert.deepEqual(codes(program({ main: kernel({ name: "m", body }) })), ["W011"]);
  assert.deepEqual(codes(program({ main: kernel({ name: "m", body }), preludes: [{ name: "ihash", text: "float ihash(float x) { return x; }\n" }] })), []);
  assert.deepEqual(codes(program({ main: kernel({ name: "m", body: [ret(f32(1))] }), preludes: [{ name: "ihash", text: "x" }] })), ["W011"], "unused");
});

test("the verifier never throws, even on something that is not a program", () => {
  assert.deepEqual(codes(/** @type {any} */ ({})), ["W001"]);
  assert.deepEqual(codes(/** @type {any} */ (null)), ["W001"]);
});
