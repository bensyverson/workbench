// How literals and the LIR nodes the survey sketches do not use are written in GLSL.
import { test } from "node:test";
import assert from "node:assert/strict";
import { glslFloat, expr, top } from "../text.js";
import { f32, i32, bool, local, uniform, op, conv, call, helper, vec, swizzle, cond, VEC2 } from "../../../lir/test/build.js";

test("an f32 literal is the shortest text that reads back as the same f32, always a float", () => {
  const cases = /** @type {Array<[number, string]>} */ ([
    [1, "1.0"], [0.5, "0.5"], [63, "63.0"], [Math.fround(0.886), "0.886"], [Math.fround(0.1), "0.1"], [100, "100.0"],
    [Math.fround(1e-7), "1e-7"], [Math.fround(1e21), "1e+21"], [-2, "(-2.0)"], [-0, "(-0.0)"], [Math.fround(1 / 3), "0.33333334"],
  ]);
  for (const [v, text] of cases) assert.equal(glslFloat(v), text);
  for (const v of [0.1, 0.886, 1 / 3, 123456.789, 1e-30, 3.4e38].map(Math.fround)) assert.equal(Math.fround(Number(glslFloat(v).replace(/[()]/g, ""))), v, `${v} reads back`);
});

test("operators are parenthesized, and a statement's own expression drops its outer pair", () => {
  const e = op("mul", "f32", op("add", "f32", local("a"), f32(1)), local("b"));
  assert.equal(expr(e), "((a + 1.0) * b)");
  assert.equal(top(e), "(a + 1.0) * b");
  assert.equal(expr(op("neg", "f32", local("a"))), "(-a)");
  assert.equal(expr(op("not", "bool", bool(true))), "(!true)");
  assert.equal(expr(op("and", "bool", bool(true), op("ne", "bool", local("a"), f32(0)))), "(true && (a != 0.0))");
});

test("conversions, integers, calls, helpers, vectors, swizzles and conditions", () => {
  assert.equal(expr(conv("i32", local("a"))), "int(a)");
  assert.equal(expr(conv("f32", uniform("u_n", "i32"))), "float(u_n)");
  assert.equal(expr(i32(-3)), "(-3)");
  assert.equal(expr(i32(2)), "2");
  assert.equal(expr(call("clamp", "clamp($0, $1, $2)", "f32", [op("add", "f32", local("a"), f32(1)), f32(0), f32(1)])), "clamp((a + 1.0), 0.0, 1.0)");
  assert.equal(expr(helper("h", "f32", [op("add", "f32", local("a"), f32(1))])), "h(a + 1.0)");
  assert.equal(expr(vec(local("a"), f32(2))), "vec2(a, 2.0)");
  assert.equal(expr(swizzle(local("v", VEC2), "y")), "v.y");
  assert.equal(expr(cond(bool(true), f32(1), f32(2))), "(true ? 1.0 : 2.0)");
});
