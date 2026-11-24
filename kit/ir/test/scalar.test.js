// The nominal scalar in the IR: a Dialect's named type stored as an f64 (a date), compared only
// with its own kind and taken by no arithmetic operator. The IR knows "a named scalar backed by
// f64", never "date": the name here is only a Dialect's choice.
import { test } from "node:test";
import assert from "node:assert/strict";
import { verify, printKernel, showType, formatJSON } from "../index.js";
import { dialectScalar, namedScalar, strictJoin, assignable, join, sameType } from "../types.js";
import { typeProblem } from "../verify-rules.js";

/** @import { Kernel, Expr, Type, Op } from "../ir.js" */

const SRC = "x".repeat(200);
/** @type {[number, number]} */
const S = [0, 10];
const DATE = dialectScalar("date", "f64");
const STAMP = dialectScalar("stamp", "f64");

/** @returns {Expr} */ const local = (/** @type {string} */ name, /** @type {Type} */ t) => ({ k: "local", name, t, span: S });
/** @returns {Expr} */ const op = (/** @type {Op} */ o, /** @type {Type} */ t, /** @type {Expr[]} */ ...args) => ({ k: "op", op: o, args, t, span: S });
/** @returns {Expr} */ const f64 = (/** @type {number} */ v) => ({ k: "num", v, t: "f64", span: S });

/**
 * A kernel over two dates and a stamp: `return value`.
 * @param {Expr} value
 * @param {Type} returns
 * @returns {Kernel}
 */
function kernel(value, returns = "bool") {
  return {
    ir: "kernel", name: "row.keep", slot: "keep", space: "row",
    params: [{ name: "a", t: DATE, kind: "param" }, { name: "b", t: DATE, kind: "param" }, { name: "s", t: STAMP, kind: "param" }, { name: "n", t: "f64", kind: "param" }],
    returns, locals: [], body: [{ k: "return", value, span: S, effects: [] }], effects: [], src: SRC, span: [0, 200],
  };
}

const a = () => local("a", DATE), b = () => local("b", DATE), s = () => local("s", STAMP), n = () => local("n", "f64");
const codes = (/** @type {Kernel} */ k) => verify(k).map((d) => d.code);

test("dialectScalar is a named type over its backing, nominal like a dialect vector", () => {
  assert.deepEqual(DATE, { scalar: "date", of: "f64" });
  assert.equal(showType(DATE), "date");
  assert.equal(showType({ opt: DATE }), "date?");
  assert.equal(namedScalar(DATE), DATE);
  assert.equal(namedScalar("f64"), null);
  assert.ok(sameType(DATE, { of: "f64", scalar: "date" }), "key order does not matter");
  assert.ok(assignable(DATE, DATE));
  for (const [x, y] of /** @type {Array<[Type, Type]>} */ ([[DATE, "f64"], ["f64", DATE], [DATE, STAMP], [DATE, "str"], [DATE, "f32"]])) {
    assert.ok(!assignable(x, y), `${showType(x)} to ${showType(y)}`);
    assert.equal(strictJoin(x, y), null, `strictJoin ${showType(x)}, ${showType(y)}`);
  }
  assert.deepEqual(strictJoin(DATE, "null"), { opt: DATE });
  assert.ok(assignable("null", { opt: DATE }));
});

test("a Kernel may hold a scalar, but never a union that mixes it with another number type", () => {
  assert.equal(typeProblem(DATE), null);
  assert.equal(typeProblem({ opt: DATE }), null);
  assert.equal(typeProblem({ list: DATE, max: 4 }), null);
  assert.match(String(typeProblem({ union: [DATE, "str"] })), /never mixes/, "as a vector, a scalar is never in a union beside members that are not it");
  assert.match(String(typeProblem(join(DATE, "f64"))), /never mixes number types/);
  assert.match(String(typeProblem(join(DATE, STAMP))), /never mixes number types/);
  assert.match(String(typeProblem({ union: [{ list: DATE, max: 2 }, { list: "f64", max: 2 }] })), /never mixes/);
  assert.match(String(typeProblem({ scalar: "date", of: "f32" })), /backed by f64/);
  assert.match(String(typeProblem({ scalar: "", of: "f64" })), /name/);
  assert.match(String(typeProblem({ scalar: "date" })), /backed by f64/);
});

test("two scalars of one kind compare and test equal; the kernel verifies, round-trips and prints", () => {
  for (const o of /** @type {Op[]} */ (["lt", "le", "gt", "ge", "eq", "ne"])) assert.deepEqual(codes(kernel(op(o, "bool", a(), b()))), [], o);
  const k = kernel(op("and", "bool", op("lt", "bool", a(), b()), op("ne", "bool", a(), b())));
  assert.deepEqual(verify(k), []);
  assert.deepEqual(JSON.parse(formatJSON(k)), k);
  const listing = printKernel(k);
  assert.match(listing, /\(a: date, b: date, s: stamp, n: f64\) -> bool/);
  assert.match(listing, /return and\(lt\(a, b\), ne\(a, b\)\)/);
  assert.deepEqual(codes(kernel(a(), DATE)), [], "a scalar is returned as itself");
});

test("a scalar meets no other type in a compare, and no arithmetic, sign, bitwise or truthiness operator", () => {
  for (const o of /** @type {Op[]} */ (["lt", "le", "gt", "ge", "eq", "ne"])) {
    assert.deepEqual(codes(kernel(op(o, "bool", a(), n()))), ["V002"], `${o} date f64`);
    assert.deepEqual(codes(kernel(op(o, "bool", a(), s()))), ["V002"], `${o} date stamp`);
    assert.deepEqual(codes(kernel(op(o, "bool", f64(0), a()))), ["V002"], `${o} literal date`);
  }
  for (const o of /** @type {Op[]} */ (["add", "sub", "mul", "div", "rem", "pow", "band", "bor", "bxor", "shl", "shr", "ushr"])) {
    assert.deepEqual(codes(kernel(op(o, DATE, a(), b()), DATE)), ["V002"], `${o} date date`);
    assert.deepEqual(codes(kernel(op(o, "f64", a(), n()), "f64")), ["V002"], `${o} date f64`);
  }
  for (const o of /** @type {Op[]} */ (["neg", "pos", "bnot"])) assert.deepEqual(codes(kernel(op(o, DATE, a()), DATE)), ["V002"], o);
  assert.deepEqual(codes(kernel(op("truthy", "bool", a()))), ["V002"], "truthy of a date: the epoch would be false");
  assert.deepEqual(codes(kernel(op("concat", "str", { k: "str", v: "at ", t: { enum: ["at "] }, span: S }, a()), "str")), ["V002"]);
  assert.deepEqual(codes(kernel(op("f32", "f32", a()), "f32")), ["V002"], "no conversion takes a scalar");
});
