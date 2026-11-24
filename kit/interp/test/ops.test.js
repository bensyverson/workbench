// Every operator, over f64, f32 and vectors: the meaning the IR gives it (ir.d.ts, `Op`).
import { test } from "node:test";
import assert from "node:assert/strict";
import { run } from "../index.js";
import { num, f32, str, bool, op, vec, field, local, returning } from "./build.js";

/** @import { Expr, Type } from "../../ir/ir.js" */

/**
 * Evaluates one expression in a kernel with params `a` and `b` (f64) and `p` and `q` (f32 vectors).
 * @param {Expr} e
 * @param {unknown[]} [inputs]
 */
const ev = (e, inputs = IN({})) => run(returning(e, [["a", "f64"], ["b", "f64"], ["p", VEC], ["q", VEC], ["x", "f32"], ["y", "f32"]]), inputs);

const VEC = /** @type {Type} */ ({ vec: 3, of: "f32", name: "vec3" });
const A = local("a"), B = local("b"), P = local("p", VEC), Q = local("q", VEC), X = local("x", "f32"), Y = local("y", "f32");
const IN = (/** @type {Partial<Record<string, unknown>>} */ o) => [o.a ?? 0, o.b ?? 0, o.p ?? [0, 0, 0], o.q ?? [0, 0, 0], o.x ?? 0, o.y ?? 0];

test("f64 arithmetic is JavaScript's", () => {
  assert.equal(ev(op("add", "f64", A, B), IN({ a: 0.1, b: 0.2 })), 0.1 + 0.2);
  assert.equal(ev(op("sub", "f64", A, B), IN({ a: 5, b: 7 })), -2);
  assert.equal(ev(op("mul", "f64", A, B), IN({ a: 3, b: 4 })), 12);
  assert.equal(ev(op("div", "f64", A, B), IN({ a: 1, b: 0 })), Infinity);
  assert.equal(ev(op("rem", "f64", A, B), IN({ a: -7, b: 3 })), -1, "rem is %, its sign the dividend's");
  assert.equal(ev(op("pow", "f64", A, B), IN({ a: 2, b: 10 })), 1024);
  assert.equal(ev(op("neg", "f64", A), IN({ a: 3 })), -3);
  assert.equal(ev(op("pos", "f64", A), IN({ a: 3 })), 3);
});

test("bitwise operators go through int32, as in JavaScript", () => {
  assert.equal(ev(op("band", "f64", A, B), IN({ a: 12, b: 10 })), 8);
  assert.equal(ev(op("bor", "f64", A, B), IN({ a: 12, b: 10 })), 14);
  assert.equal(ev(op("bxor", "f64", A, B), IN({ a: 12, b: 10 })), 6);
  assert.equal(ev(op("bnot", "f64", A), IN({ a: 5 })), -6);
  assert.equal(ev(op("shl", "f64", A, B), IN({ a: 1, b: 31 })), -2147483648);
  assert.equal(ev(op("shr", "f64", A, B), IN({ a: -8, b: 1 })), -4);
  assert.equal(ev(op("ushr", "f64", A, B), IN({ a: -1, b: 28 })), 15);
  assert.equal(ev(op("band", "f64", A, B), IN({ a: 2 ** 32 + 5, b: 7 })), 5, "a double past int32 wraps");
});

test("comparisons take numbers or strings", () => {
  assert.equal(ev(op("lt", "bool", A, B), IN({ a: 1, b: 2 })), true);
  assert.equal(ev(op("le", "bool", A, B), IN({ a: 2, b: 2 })), true);
  assert.equal(ev(op("gt", "bool", A, B), IN({ a: 2, b: 2 })), false);
  assert.equal(ev(op("ge", "bool", A, B), IN({ a: 2, b: 2 })), true);
  assert.equal(ev(op("eq", "bool", A, B), IN({ a: NaN, b: NaN })), false, "NaN is not equal to itself");
  assert.equal(ev(op("ne", "bool", A, B), IN({ a: NaN, b: NaN })), true);
  assert.equal(ev(op("eq", "bool", str("a"), str("a"))), true);
  assert.equal(ev(op("lt", "bool", str("a"), str("b"))), true);
  assert.equal(ev(op("ne", "bool", str("a"), str("b"))), true);
  assert.equal(ev(op("lt", "bool", X, Y), IN({ x: 1, y: 2 })), true, "f32s compare too");
});

test("not, truthy, present", () => {
  assert.equal(ev(op("not", "bool", bool(true))), false);
  assert.equal(ev(op("truthy", "bool", A), IN({ a: 0 })), false);
  assert.equal(ev(op("truthy", "bool", A), IN({ a: NaN })), false);
  assert.equal(ev(op("truthy", "bool", A), IN({ a: -2 })), true);
  assert.equal(ev(op("truthy", "bool", str("a"))), true);
  const e = { k: "local", name: "m", t: { opt: { ref: "E" } }, span: [0, 1] };
  const k = returning(op("present", "bool", /** @type {Expr} */ (e)), [["m", { opt: { ref: "E" } }]]);
  assert.equal(run(k, [null]), false);
  assert.equal(run(k, [undefined]), false);
  assert.equal(run(k, [{}]), true);
});

test("and and or are lazy: the right side runs only when the left leaves it open", () => {
  /** @type {string[]} */
  const seen = [];
  const env = { intrinsics: { probe: { ref: () => { seen.push("probe"); return 1; } } } };
  const probe = { k: "call", fn: "probe", args: [], t: "bool", effects: [], span: [0, 1] };
  const k = (/** @type {"and" | "or"} */ o, /** @type {boolean} */ left) => returning(op(o, "bool", bool(left), /** @type {Expr} */ (/** @type {unknown} */ (probe))));
  assert.equal(run(k("and", false), [], env), false);
  assert.equal(run(k("or", true), [], env), true);
  assert.deepEqual(seen, [], "the right side was skipped");
  run(k("and", true), [], env);
  run(k("or", false), [], env);
  assert.deepEqual(seen, ["probe", "probe"]);
});

test("concat joins a string with a string or a number", () => {
  assert.equal(ev(op("concat", "str", str("n="), num(3))), "n=3");
  assert.equal(ev(op("concat", "str", num(3), str("!"))), "3!");
});

test("f32 arithmetic rounds to f32 after every operation", () => {
  const x = Math.fround(0.1), y = Math.fround(0.2);
  assert.equal(ev(op("add", "f32", X, Y), IN({ x, y })), Math.fround(x + y));
  assert.notEqual(Math.fround(x + y), x + y, "the sum in doubles is not an f32, so the rounding matters");
  assert.equal(ev(op("mul", "f32", X, Y), IN({ x, y })), Math.fround(x * y));
  assert.equal(ev(op("div", "f32", X, Y), IN({ x, y })), Math.fround(x / y));
  assert.equal(ev(op("sub", "f32", X, Y), IN({ x, y })), Math.fround(x - y));
  assert.equal(ev(op("neg", "f32", X), IN({ x })), -x);
  assert.equal(ev(op("rem", "f32", X, Y), IN({ x: 5.5, y: 2 })), 1.5);
  assert.equal(ev(op("pow", "f32", X, Y), IN({ x: 3, y: 2 })), 9);
  assert.equal(ev(op("gt", "bool", X, Y), IN({ x: 3, y: 2 })), true);
});

test("an expression's rounding is cumulative: each step is rounded, not only the last", () => {
  const x = Math.fround(16777216), one = f32(1);
  // (x + 1) - x: in doubles it is 1; with each step rounded to f32, x + 1 is x again, so it is 0.
  const e = op("sub", "f32", op("add", "f32", X, one), X);
  assert.equal(ev(e, IN({ x })), 0);
});

test("f32 and f64 convert explicitly", () => {
  assert.equal(ev(op("f32", "f32", A), IN({ a: 0.1 })), Math.fround(0.1));
  assert.equal(ev(op("f64", "f64", X), IN({ x: Math.fround(0.1) })), Math.fround(0.1), "widening is exact");
  assert.equal(ev(op("f64", "f64", op("f32", "f32", A)), IN({ a: 1 / 3 })), Math.fround(1 / 3));
});

test("a vec node builds a vector in order; field reads a component", () => {
  const v = vec([X, Y, f32(3)], "f32", "vec3");
  assert.deepEqual(ev(v, IN({ x: 1, y: 2 })), [1, 2, 3]);
  assert.equal(ev(field(P, "x", "f32"), IN({ p: [7, 8, 9] })), 7);
  assert.equal(ev(field(P, "y", "f32"), IN({ p: [7, 8, 9] })), 8);
  assert.equal(ev(field(P, "z", "f32"), IN({ p: [7, 8, 9] })), 9);
  const w = { vec: /** @type {const} */ (4), of: /** @type {const} */ ("f32") };
  assert.equal(run(returning(field(local("v", w), "w", "f32"), [["v", w]]), [[1, 2, 3, 4]]), 4);
});

test("vector arithmetic is componentwise, each component rounded to f32", () => {
  const p = [0.1, 0.2, 0.3].map(Math.fround), q = [0.7, 0.6, 0.5].map(Math.fround);
  const cw = (/** @type {(a: number, b: number) => number} */ f) => p.map((a, i) => Math.fround(f(a, q[i])));
  assert.deepEqual(ev(op("add", VEC, P, Q), IN({ p, q })), cw((a, b) => a + b));
  assert.deepEqual(ev(op("sub", VEC, P, Q), IN({ p, q })), cw((a, b) => a - b));
  assert.deepEqual(ev(op("mul", VEC, P, Q), IN({ p, q })), cw((a, b) => a * b));
  assert.deepEqual(ev(op("div", VEC, P, Q), IN({ p, q })), cw((a, b) => a / b));
  assert.deepEqual(ev(op("neg", VEC, P), IN({ p })), p.map((a) => -a));
  assert.deepEqual(ev(op("pos", VEC, P), IN({ p })), p);
});

test("a scalar of the vector's type broadcasts where the verifier allows it: mul either side, div on the right", () => {
  const p = [1, 2, 3], x = Math.fround(0.1);
  const want = p.map((a) => Math.fround(a * x));
  assert.deepEqual(ev(op("mul", VEC, P, X), IN({ p, x })), want);
  assert.deepEqual(ev(op("mul", VEC, X, P), IN({ p, x })), want);
  assert.deepEqual(ev(op("div", VEC, P, X), IN({ p, x })), p.map((a) => Math.fround(a / x)));
});

test("an f64 vector keeps double precision", () => {
  const d = { vec: /** @type {const} */ (2), of: /** @type {const} */ ("f64") };
  const e = op("add", d, local("a", d), local("b", d));
  assert.deepEqual(run(returning(e, [["a", d], ["b", d]]), [[0.1, 0.2], [0.2, 0.4]]), [0.1 + 0.2, 0.2 + 0.4]);
});

test("a vector result is a new array: the operands are not changed", () => {
  const p = [1, 2, 3];
  ev(op("add", VEC, P, P), IN({ p }));
  assert.deepEqual(p, [1, 2, 3]);
});

test("an input is rounded to its parameter's type: an f32 parameter never holds a double", () => {
  assert.equal(ev(X, IN({ x: 0.1 })), Math.fround(0.1));
  assert.deepEqual(ev(P, IN({ p: [0.1, 0.2, 0.3] })), [0.1, 0.2, 0.3].map(Math.fround));
});

test("what the IR does not allow is refused, not guessed: a scalar added to a vector, a scalar divided by a vector, vectors compared", async () => {
  const { applyOp } = await import("../values.js");
  assert.throws(() => applyOp("add", [[1, 2], 1]), /two vectors or two scalars/);
  assert.throws(() => applyOp("add", [1, [1, 2]]), /two vectors or two scalars/);
  assert.throws(() => applyOp("div", [1, [1, 2]]), /scalar before a vector/);
  assert.throws(() => applyOp("rem", [[1, 2], 2]), /scalars/);
  assert.throws(() => applyOp("lt", [[1, 2], [1, 2]]), /scalars/);
  assert.throws(() => applyOp("add", [[1, 2], [1, 2, 3]]), /components/);
  assert.throws(() => applyOp("add", [1]), /2 operands/);
});
