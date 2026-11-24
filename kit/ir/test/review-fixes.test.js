// Verifier and type rules found wanting by the review of the f32 and vector types: a union
// of numbers or vectors, an f32 store rule, non-finite numbers, vector types by their fields.
import { test } from "node:test";
import assert from "node:assert/strict";
import { verify } from "../verify.js";
import { dialectVector, sameType, join, assignable } from "../types.js";

/** @import { Kernel, Expr, Type } from "../ir.js" */

const VEC2 = dialectVector("vec2", 2, "f32");
const COLOR = dialectVector("color", 3, "f32");
/** @type {[number, number]} */
const S = [0, 1];
/** @returns {Kernel} */
const base = (/** @type {import("../ir.js").Stmt[]} */ body, /** @type {Type} */ returns, /** @type {import("../ir.js").Local[]} */ params = [{ name: "k", t: "f32", kind: "param" }], locals = /** @type {import("../ir.js").Local[]} */ ([])) =>
  ({ ir: "kernel", name: "t", slot: "pixel", space: "pixel", params, returns, locals, body, effects: [], src: "x".repeat(50), span: [0, 50] });
const withEffects = (/** @type {Kernel} */ k) => ({ ...k, effects: /** @type {import("../ir.js").Effect[]} */ (["write W.t"]) });
const ret = (/** @type {Expr} */ value) => /** @type {import("../ir.js").Stmt} */ ({ k: "return", value, span: S, effects: [] });
const num = (/** @type {number} */ v, t = /** @type {Type} */ ("f64")) => /** @type {Expr} */ ({ k: "num", v, t, span: S });
const local = (/** @type {string} */ name, /** @type {Type} */ t) => /** @type {Expr} */ ({ k: "local", name, t, span: S });
const codes = (/** @type {Kernel} */ k) => verify(k, { partial: true }).map((d) => d.code);

test("a cond typed f32 | f64 is rejected", () => {
  const cond = /** @type {Expr} */ ({ k: "cond", test: { k: "bool", v: true, t: "bool", span: S }, then: local("k", "f32"), else: num(1), t: { union: ["f32", "f64"] }, span: S });
  assert.notDeepEqual(codes(base([ret(cond)], { union: ["f32", "f64"] })), []);
});

test("a kernel returning a union of two vector types is rejected, and a union of strings is not", () => {
  const p = /** @type {import("../ir.js").Local[]} */ ([{ name: "a", t: VEC2, kind: "param" }, { name: "c", t: COLOR, kind: "param" }]);
  const cond = /** @type {Expr} */ ({ k: "cond", test: { k: "bool", v: true, t: "bool", span: S }, then: local("a", VEC2), else: local("c", COLOR), t: { union: [VEC2, COLOR] }, span: S });
  assert.notDeepEqual(codes(base([ret(cond)], { union: [VEC2, COLOR] }, p)), []);
  const ok = /** @type {Expr} */ ({ k: "cond", test: { k: "bool", v: true, t: "bool", span: S }, then: num(1), else: { k: "str", v: "a", t: { enum: ["a"] }, span: S }, t: { union: ["f64", { enum: ["a"] }] }, span: S });
  assert.deepEqual(codes(base([ret(ok)], { union: ["f64", { enum: ["a"] }] })), []);
});

test("a num of Infinity, NaN or -0 is V002 from the num rule itself", () => {
  for (const v of [Infinity, -Infinity, NaN, -0]) {
    for (const t of /** @type {const} */ (["f64", "f32"])) {
      const d = verify(base([ret(num(v, t))], t));
      assert.ok(d.some((x) => x.code === "V002"), `${v} ${t}: ${d.map((x) => x.code)}`);
    }
  }
});

test("an f32 store rule fits an f32 place, not an f64 one; an f64 rule the reverse", () => {
  const W = { obj: "W" };
  /** @param {Type} t @param {"f32" | "f64"} rule */
  const stored = (t, rule) => withEffects(base(
    [{ k: "store", place: { recv: local("w", W), owner: "W", name: "t", t, store: { type: rule } }, value: local("k", "f32"), span: S, effects: ["write W.t"] }],
    "void", [{ name: "w", t: W, kind: "param" }, { name: "k", t: "f32", kind: "param" }]));
  const run = (/** @type {Type} */ t, /** @type {"f32" | "f64"} */ rule) => verify(stored(t, rule), { partial: true }).map((d) => d.code);
  assert.deepEqual(run("f32", "f32"), []);
  assert.deepEqual(run("f64", "f64").includes("V002"), true, "storing an f32 into an f64 place");
  assert.deepEqual(run("f32", "f64"), ["V002"]);
  assert.ok(run("f64", "f32").includes("V002"));
});

test("a message about an f32 place says 'An f32', not 'A f32'", () => {
  const W = { obj: "W" };
  const k = withEffects(base(
    [{ k: "store", place: { recv: local("w", W), owner: "W", name: "t", t: "f32", store: { type: "f64" } }, value: local("k", "f32"), span: S, effects: ["write W.t"] }],
    "void", [{ name: "w", t: W, kind: "param" }, { name: "k", t: "f32", kind: "param" }]));
  const msgs = verify(k, { partial: true }).map((d) => d.message).join(" ");
  assert.match(msgs, /An f32 place/);
  assert.doesNotMatch(msgs, /A f32/);
});

test("sameType compares vector types by their fields, not their key order", () => {
  assert.ok(sameType({ vec: 2, of: "f32", name: "vec2" }, { name: "vec2", vec: 2, of: "f32" }));
  assert.ok(!sameType(VEC2, COLOR));
  assert.ok(!sameType({ vec: 2, of: "f32", name: "vec2" }, { vec: 2, of: "f32" }), "a nominal vector is not the structural one");
  assert.ok(assignable({ name: "vec2", of: "f32", vec: 2 }, VEC2));
  assert.deepEqual(join({ name: "vec2", of: "f32", vec: 2 }, VEC2), { name: "vec2", of: "f32", vec: 2 });
  assert.ok(sameType({ struct: { a: "f64", b: "bool" } }, { struct: { b: "bool", a: "f64" } }));
});

test("a for counter has its start's type: f32 verifies, and a local declared the other type does not", () => {
  const counted = (/** @type {Type} */ declared) => base(
    [{
      k: "for", name: "i", init: num(0, "f32"), bound: "const 3", span: S, effects: [],
      test: { k: "op", op: "lt", args: [local("i", "f32"), num(3, "f32")], t: "bool", span: S },
      update: [{ k: "set", name: "i", value: { k: "op", op: "add", args: [local("i", "f32"), num(1, "f32")], t: "f32", span: S }, span: S, effects: [] }],
      body: [],
    }, ret(local("k", "f32"))],
    "f32", [{ name: "k", t: "f32", kind: "param" }], [{ name: "i", t: declared, kind: "let" }]);
  assert.deepEqual(codes(counted("f32")), []);
  assert.ok(codes(counted("f64")).includes("V002"));
});
