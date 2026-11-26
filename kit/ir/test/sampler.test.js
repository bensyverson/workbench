// The sampler type: a handle onto an image a Kernel only samples. A sampler value is a load of a read-only place
// (a uniform) or a parameter, and it stands only as an argument of a call; anything else is V002, and a type that
// holds a sampler inside another (a list of them, an optional one) is V003.
import { test } from "node:test";
import assert from "node:assert/strict";
import { verify } from "../verify.js";
import { typeProblem } from "../verify-rules.js";
import { showType, assignable, sameType } from "../types.js";

/** @import { Kernel, Expr, Stmt, Type, Local } from "../ir.js" */

const SRC = "x".repeat(200);
/** @type {[number, number]} */
const S = [0, 10];
const VEC2 = /** @type {Type} */ ({ vec: 2, of: "f32", name: "vec2" });
const VEC4 = /** @type {Type} */ ({ vec: 4, of: "f32", name: "vec4" });
const U = /** @type {Type} */ ({ obj: "Uniforms" });
/** @type {Type} */
const SAMPLER = "sampler";

/** @returns {Expr} */ const local = (/** @type {string} */ name, /** @type {Type} */ t) => ({ k: "local", name, t, span: S });
/** @returns {Expr} */ const atlas = () => ({ k: "load", place: { recv: local("u", U), owner: "Uniforms", name: "atlas", t: SAMPLER }, t: SAMPLER, span: S });
/** @returns {Expr} */ const sample = (/** @type {Expr} */ img) => ({ k: "call", fn: "sample", args: [img, local("uv", VEC2)], effects: [], t: VEC4, span: S });
/** @returns {Stmt} */ const ret = (/** @type {Expr} */ value) => ({ k: "return", value, span: S, effects: [] });

/**
 * A pixel Kernel over `body`, with `extra` locals.
 * @param {Stmt[]} body @param {Local[]} [extra] @param {Partial<Kernel>} [over]
 * @returns {Kernel}
 */
const kernel = (body, extra = [], over = {}) => ({
  ir: "kernel", name: "p.pixel", slot: "pixel", space: "pixel",
  params: [{ name: "uv", t: VEC2, kind: "param" }, { name: "u", t: U, kind: "param" }],
  returns: VEC4, locals: extra, body, effects: [], src: SRC, span: S, ...over,
});

/** @param {Kernel} k */
const codes = (k) => verify(k).map((d) => d.code);

test("sampler is a named type: shown by name, the same only as itself, assignable only to itself", () => {
  assert.equal(showType(SAMPLER), "sampler");
  assert.equal(typeProblem(SAMPLER), null);
  assert.ok(sameType(SAMPLER, "sampler"));
  assert.ok(assignable(SAMPLER, SAMPLER));
  assert.ok(!assignable(SAMPLER, "f32"));
  assert.ok(!assignable("f32", SAMPLER));
  assert.ok(!assignable(SAMPLER, U));
});

test("a sampler is never held inside another type", () => {
  for (const t of [{ list: SAMPLER, max: 2 }, { opt: SAMPLER }, { struct: { a: SAMPLER } }, { union: [SAMPLER, "f32"] }]) {
    assert.match(String(typeProblem(t)), /sampler/, JSON.stringify(t));
  }
});

test("a uniform sampler passed to an intrinsic verifies", () => {
  assert.deepEqual(verify(kernel([ret(sample(atlas()))])), []);
});

test("a helper's sampler parameter passed on verifies, and so does a helper call given a uniform sampler", () => {
  const helper = kernel([ret(sample(local("img", SAMPLER)))], [], { name: "cell", slot: "helper", params: [{ name: "img", t: SAMPLER, kind: "param" }, { name: "uv", t: VEC2, kind: "param" }] });
  assert.deepEqual(verify(helper), []);
  const caller = kernel([{ k: "return", value: { k: "helper", name: "cell", args: [atlas(), local("uv", VEC2)], effects: [], t: VEC4, span: S }, span: S, effects: ["call cell"] }], [], { effects: ["call cell"] });
  assert.deepEqual(verify(caller), []);
});

test("a sampler held in a local is V002, and the local's declaration too", () => {
  const k = kernel([{ k: "let", name: "s", t: SAMPLER, value: atlas(), span: S, effects: [] }, ret(sample(local("s", SAMPLER)))], [{ name: "s", t: SAMPLER, kind: "const" }]);
  const ds = verify(k);
  assert.ok(ds.length >= 1 && ds.every((d) => d.code === "V002"), JSON.stringify(ds));
  assert.ok(ds.some((d) => /sampler/.test(d.message)));
});

test("a sampler compared, chosen by a ternary or returned is V002", () => {
  const eq = /** @type {Expr} */ ({ k: "op", op: "eq", args: [atlas(), atlas()], t: "bool", span: S });
  const pick = /** @type {Expr} */ ({ k: "cond", test: { k: "bool", v: true, t: "bool", span: S }, then: atlas(), else: atlas(), t: SAMPLER, span: S });
  assert.deepEqual([...new Set(codes(kernel([{ k: "if", test: eq, then: [], else: [], span: S, effects: [] }, ret(sample(atlas()))])))], ["V002"]);
  assert.deepEqual([...new Set(codes(kernel([ret(sample(pick))])))], ["V002"]);
  assert.deepEqual([...new Set(codes(kernel([ret(atlas())], [], { returns: SAMPLER })))], ["V002"]);
});

test("a member read of a sampler is V002: it has none", () => {
  const field = /** @type {Expr} */ ({ k: "field", of: atlas(), name: "width", t: "f32", span: S });
  const ds = verify(kernel([{ k: "do", value: field, span: S, effects: [] }, ret(sample(atlas()))]));
  assert.ok(ds.some((d) => d.code === "V002" && /sampler/.test(d.message)), JSON.stringify(ds));
});
