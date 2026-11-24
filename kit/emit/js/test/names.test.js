// Names the emitted code owns (Math, the vector runtime's `$`-names, an intrinsic's own prelude) must
// survive an author's local of the same name; and `**` needs its left operand parenthesized.
import { test } from "node:test";
import assert from "node:assert/strict";
import { emitKernel, emitHelpers, instantiate } from "../index.js";
import { run } from "../../../interp/index.js";
import { INTRINSICS } from "../../../dialects/fields/index.js";
import { num, f32, op, local, call, helper, let_, set, ret, kernel, returning } from "../../../interp/test/build.js";

/** @import { Type, Kernel } from "../../../ir/ir.js" */

const V3 = /** @type {Type} */ ({ vec: 3, of: "f32", name: "vec3" });
const OPTS = { intrinsics: INTRINSICS };

/**
 * @param {Kernel} k
 * @param {unknown[]} inputs
 */
function same(k, inputs) {
  const want = run(k, structuredClone(inputs), { intrinsics: INTRINSICS });
  const emitted = emitKernel(k, OPTS);
  const got = instantiate(emitted)(...structuredClone(inputs));
  assert.deepStrictEqual(got, want, emitted.source);
  return got;
}

test("a local named Math does not hide the Math.fround the emitted code calls", () => {
  const k = kernel({ name: "k#0", params: [["x", "f32"]], returns: "f32", body: [
    let_("Math", "f32", f32(3)),
    ret(op("add", "f32", local("x", "f32"), local("Math", "f32"))),
  ] });
  assert.equal(same(k, [0.1]), Math.fround(Math.fround(0.1) + 3));
});

test("a local named like the vector runtime ($fv) does not collide with it", () => {
  const k = kernel({ name: "k#0", params: [["p", V3]], returns: V3, body: [
    let_("$fv", "f32", f32(3)),
    ret(op("mul", V3, local("p", V3), local("$fv", "f32"))),
  ] });
  assert.deepEqual(same(k, [[0.1, 0.2, 0.3]]), [0.1, 0.2, 0.3].map((v) => Math.fround(Math.fround(v) * 3)));
});

test("a parameter named Math is renamed too, and so is a set of a local that is", () => {
  const k = kernel({ name: "k#0", params: [["Math", "f32"]], returns: "f32", body: [
    let_("$vadd", "f32", local("Math", "f32")),
    set("$vadd", op("add", "f32", local("$vadd", "f32"), f32(1))),
    ret(local("$vadd", "f32")),
  ] });
  assert.equal(same(k, [0.5]), 1.5);
  assert.ok(!emitKernel(k).params.includes("Math"));
});

test("a local named like an intrinsic keeps the intrinsic's own prelude intact", () => {
  const k = kernel({ name: "k#0", params: [["x", "f32"]], returns: "f32", body: [
    let_("fract", "f32", f32(2)),
    ret(op("add", "f32", call("fract", "f32", [local("x", "f32")]), local("fract", "f32"))),
  ] });
  same(k, [0.75]);
});

test("names that do not collide are emitted as the author wrote them", () => {
  const k = kernel({ name: "k#0", params: [["x", "f32"]], returns: "f32", body: [let_("y", "f32", f32(3)), ret(op("add", "f32", local("x", "f32"), local("y", "f32")))] });
  const e = emitKernel(k, OPTS);
  assert.deepEqual(e.params, ["x"]);
  assert.match(e.source, /let y = 3;/);
});

test("f64 pow with a negative literal on the left is parenthesized, not a SyntaxError", () => {
  const k = returning(op("pow", "f64", num(-2), local("a")), [["a", "f64"]]);
  assert.equal(same(k, [2]), 4);
  assert.equal(same(returning(op("pow", "f64", num(2), local("a")), [["a", "f64"]]), [3]), 8);
});

test("a local named `$q` is not renamed onto the helper `q` the kernel calls", () => {
  const k = kernel({ name: "k#0", params: [["x", "f32"]], returns: "f32", body: [
    let_("$q", "f32", f32(2)),
    ret(op("add", "f32", helper("q", "f32", [local("x", "f32")]), local("$q", "f32"))),
  ] });
  const emitted = emitKernel(k, OPTS);
  const q = emitKernel(kernel({ name: "q", params: [["a", "f32"]], returns: "f32", body: [ret(op("mul", "f32", local("a", "f32"), f32(10)))] }), OPTS);
  const fn = instantiate(emitted, emitHelpers([q]));
  assert.equal(fn(0.5), 7, emitted.source);
});
