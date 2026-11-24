// Lowering M2's value types where an environment declares them: typed operators on
// f32s and vectors (D1), construction, component access and explicit conversions, with
// a coded, tipped error for every mix the IR forbids. The environment here is a minimal
// stand-in written for these tests, not the fields Dialect.
import { test } from "node:test";
import assert from "node:assert/strict";
import { lowerLambda } from "../index.js";
import { dialectVector } from "../../ir/types.js";
import { printKernel } from "../../ir/print.js";

/** @import { Environment, SlotRef } from "../environment.js" */
/** @import { Expr, Kernel, Stmt } from "../../ir/ir.js" */

const VEC2 = dialectVector("vec2", 2, "f32");
const VEC3 = dialectVector("vec3", 3, "f32");
const COLOR = dialectVector("color", 3, "f32");

/** @type {Environment} */
const environment = {
  name: "vectors (test)",
  objects: { Math: { label: "Math", members: { max: { kind: "fn", params: ["f64", "f64"], returns: "f64", effects: [] } } } },
  list: {},
  queries: [],
  globals: { Math: { obj: "Math" } },
  vectors: { vec2: VEC2, vec3: VEC3, color: COLOR },
  conversions: { f32: "f32", f64: "f64" },
  // Every slot passes (uv: vec2, k: f32, c: color, d: f64); `shade` must return an f32, the rest infer.
  slot: (ref) => ({ params: [VEC2, "f32", COLOR, "f64"], returns: ref.kind === "shade" ? "f32" : "infer", space: "pixel", forbid: [] }),
};

/**
 * Lowers `src` in the test environment.
 * @param {string} src
 * @param {string} [kind]
 */
function lower(src, kind = "pixel") {
  /** @type {SlotRef} */
  const slot = { id: `p.${kind}`, kind, on: "p" };
  return lowerLambda(environment, src, slot);
}

/**
 * Lowers `src`, asserting it has no diagnostics, and returns the kernel and the value of its first return.
 * @param {string} src
 * @param {string} [kind]
 */
function ok(src, kind) {
  const r = lower(src, kind);
  assert.deepEqual(r.diagnostics.map((d) => `${d.code} ${d.message}`), [], src);
  const k = /** @type {Kernel} */ (r.kernel);
  const ret = /** @type {Extract<Stmt, { k: "return" }>} */ (k.body.find((s) => s.k === "return"));
  return { k, v: /** @type {Expr} */ (ret.value) };
}

/**
 * Lowers `src`, asserting it fails with exactly one diagnostic of `code`, and returns it with the text it points at.
 * @param {string} code
 * @param {string} src
 */
function only(code, src) {
  const r = lower(src);
  assert.equal(r.kernel, null, src);
  assert.deepEqual(r.diagnostics.map((d) => d.code), [code], `${src}: ${r.diagnostics.map((d) => d.message).join(" | ")}`);
  const d = r.diagnostics[0];
  assert.ok(d.tip.length > 0 && !d.tip.includes("\n"), "a one-line fix");
  return { d, text: src.slice(d.range[0], d.range[1]) };
}

const P = "(uv, k, c, d) =>";

test("typed operators: uv + k * uv is vector arithmetic, resolved on the operands' types", () => {
  const { k, v } = ok(`${P} uv + k * uv`);
  assert.deepEqual(k.returns, VEC2);
  assert.equal(v.k === "op" && v.op, "add");
  assert.deepEqual(v.t, VEC2);
  const mul = v.k === "op" ? v.args[1] : v;
  assert.equal(mul.k === "op" && mul.op, "mul");
  assert.deepEqual(mul.t, VEC2);
  assert.match(printKernel(k), /return add\.vec2\(uv, mul\.vec2\(k, uv\)\)/);
});

test("componentwise on one vector type, and a vector divided by its scalar", () => {
  assert.deepEqual(ok(`${P} c * c`).v.t, COLOR);
  assert.deepEqual(ok(`${P} uv - uv / k`).v.t, VEC2);
  assert.deepEqual(ok(`${P} -uv`).v.t, VEC2);
  assert.deepEqual(ok(`${P} { let a = uv; a += uv * k; return a; }`).k.returns, VEC2);
});

test("f32 arithmetic gives f32: + - * / % ** and unary minus", () => {
  for (const src of ["k + k", "k - k * k", "k / k", "k % k", "k ** k", "-k"]) assert.equal(ok(`${P} ${src}`).v.t, "f32", src);
});

test("a number literal takes f32 from its context, rounded to f32 once, here in lowering", () => {
  const a = ok(`${P} uv * 0.1`).v;
  const lit = a.k === "op" ? a.args[1] : a;
  assert.deepEqual([lit.k, lit.t, lit.k === "num" && lit.v], ["num", "f32", Math.fround(0.1)]);
  assert.equal(ok(`${P} k + 1`).v.t, "f32");
  assert.equal(ok(`${P} 2 * k`).v.t, "f32");
  assert.deepEqual(ok(`${P} -0.5 * uv`).v.t, VEC2, "a negated literal too");
  assert.equal(ok(`${P} k < 0.5`).v.t, "bool");
  const shade = ok(`${P} 0.25`, "shade").v;
  assert.deepEqual([shade.k, shade.t], ["num", "f32"], "where the slot's result is f32");
  assert.equal(ok(`${P} d + 1`).v.t, "f64", "f64 code is as before");
});

test("construction: a vector type's name, called with one scalar per component", () => {
  const { v } = ok(`${P} vec2(k, 0.5)`);
  assert.equal(v.k, "vec");
  assert.deepEqual(v.t, VEC2);
  assert.deepEqual(v.k === "vec" && v.items.map((i) => i.t), ["f32", "f32"]);
  assert.deepEqual(ok(`${P} color(1, 0.5, k)`).v.t, COLOR);
  const { d } = only("L015", `${P} vec3(k, k)`);
  assert.match(d.tip, /3/);
  const f64 = only("L003", `${P} vec2(d, k)`);
  assert.equal(f64.text, "d");
  assert.match(f64.d.tip, /f32\(/);
});

test("component access: .x .y .z .w up to the vector's size, typed by its scalar", () => {
  assert.equal(ok(`${P} uv.y`).v.t, "f32");
  assert.equal(ok(`${P} c.z * k`).v.t, "f32");
  const { d, text } = only("L002", `${P} uv.z`);
  assert.equal(text, "z");
  assert.match(d.tip, /x, y/);
  only("L002", `${P} uv.xy`);
});

test("conversions between f64 and f32 are explicit calls, and never a no-op", () => {
  const { v } = ok(`${P} f32(d) * k`);
  const conv = v.k === "op" ? v.args[0] : v;
  assert.deepEqual([conv.k === "op" && conv.op, conv.t], ["f32", "f32"]);
  assert.equal(ok(`${P} f64(k) + d`).v.t, "f64");
  assert.equal(ok(`${P} f32(Math.max(d, 1))`).v.t, "f32");
  const same = only("L003", `${P} f32(k)`);
  assert.match(same.d.message, /already f32/);
  assert.match(same.d.tip, /[Rr]emove/);
  only("L003", `${P} f64(uv)`);
  only("L015", `${P} f32(d, d)`);
});

test("no implicit f64 to f32 conversion: a mixed operation is L003, and the tip names the fix", () => {
  for (const src of ["k + d", "d * uv", "k < d", "k === d"]) {
    const { d } = only("L003", `${P} ${src}`);
    assert.match(d.message, /f32/, src);
    assert.match(d.message, /f64/, src);
    assert.match(d.tip, /f32\(.*\)|f64\(.*\)/, src);
  }
});

test("Dialect vector types are nominal: color and vec3 never mix, though both are three f32s", () => {
  const { d } = only("L003", `${P} c + vec3(1, 2, 3)`);
  assert.match(d.message, /color/);
  assert.match(d.message, /vec3/);
  assert.match(d.tip, /color\(/);
});

test("a scalar and a vector add only by building the vector; a scalar is not divided by one", () => {
  const add = only("L003", `${P} uv + k`);
  assert.match(add.d.tip, /vec2\(k, k\)/);
  only("L003", `${P} k / uv`);
});

test("vectors are not compared, ordered, tested, or used with bitwise or other operators", () => {
  const eq = only("L003", `${P} uv === uv`);
  assert.match(eq.d.tip, /uv\.x/);
  only("L003", `${P} uv < uv`);
  const t = only("L003", `${P} { if (uv) return 1; return 0; }`);
  assert.equal(t.text, "uv");
  only("L003", `${P} uv % uv`);
  assert.match(only("L003", `${P} ~k`).d.tip, /f64\(k\)/);
  assert.match(only("L003", `${P} k | 0`).d.tip, /f64\(k\)\./, "the fix converts the f32 operand, not the whole expression");
  only("L003", `${P} uv & uv`);
});

test("a vector type's or a conversion's name read without a call is L003", () => {
  const { d } = only("L003", `${P} { const f = vec2; return uv; }`);
  assert.match(d.tip, /vec2\(/);
});

test("an f32 literal outside f32's finite range is L016, with the range in the tip", () => {
  const { d, text } = only("L016", `${P} k * 1e39`);
  assert.equal(text, "1e39");
  assert.match(d.message, /f32/);
  assert.match(d.tip, /3\.4e\+?38/);
  only("L016", `${P} vec2(-1e39, 0)`);
  assert.equal(ok(`${P} k * 3e38`).v.t, "f32", "the largest finite values still lower");
});
