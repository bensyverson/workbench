// M2's value types in the IR: f32 and vectors of 2, 3 or 4 components. A hand-built
// kernel that uses every vector and f32 operation verifies clean, round-trips its JSON
// form and prints; each rule the verifier adds for them, broken alone, gives its code.
import { test } from "node:test";
import assert from "node:assert/strict";
import { verify, printKernel, showType, formatJSON } from "../index.js";
import { dialectVector, strictJoin, assignable, join } from "../types.js";
import { f32Text } from "../print.js";

/** @import { Kernel, Expr, Type, Op } from "../ir.js" */

const SRC = "x".repeat(200);
/** @type {[number, number]} */
const S = [0, 10];
const VEC2 = dialectVector("vec2", 2, "f32");
const VEC3 = dialectVector("vec3", 3, "f32");
const COLOR = dialectVector("color", 3, "f32");

/** @returns {Expr} */ const local = (/** @type {string} */ name, /** @type {Type} */ t) => ({ k: "local", name, t, span: S });
/** @returns {Expr} */ const op = (/** @type {Op} */ o, /** @type {Type} */ t, /** @type {Expr[]} */ ...args) => ({ k: "op", op: o, args, t, span: S });
/** @returns {Expr} */ const f32 = (/** @type {number} */ v) => ({ k: "num", v: Math.fround(v), t: "f32", span: S });
/** @returns {Expr} */ const f64 = (/** @type {number} */ v) => ({ k: "num", v, t: "f64", span: S });

/**
 * A kernel that uses every f32 and vector operation: componentwise arithmetic, scalar
 * times vector, component access, construction, both conversions, an f32 compare.
 * @returns {Kernel}
 */
function vrich() {
  const let_ = (/** @type {string} */ name, /** @type {Type} */ t, /** @type {Expr} */ value) => ({ k: /** @type {const} */ ("let"), name, t, value, span: S, effects: [] });
  const uv = local("uv", VEC2), k = local("k", "f32"), c = local("c", COLOR), d = local("d", "f64");
  return {
    ir: "kernel", name: "pixel(vrich)", slot: "pixel", space: "pixel",
    params: [{ name: "uv", t: VEC2, kind: "param" }, { name: "k", t: "f32", kind: "param" }, { name: "c", t: COLOR, kind: "param" }, { name: "d", t: "f64", kind: "param" }],
    returns: COLOR,
    locals: [
      { name: "a", t: VEC2, kind: "const" }, { name: "b", t: VEC2, kind: "const" }, { name: "s", t: "f32", kind: "const" },
      { name: "n", t: VEC2, kind: "const" }, { name: "e", t: "f32", kind: "const" }, { name: "g", t: "f64", kind: "const" },
      { name: "q", t: VEC2, kind: "const" }, { name: "h", t: COLOR, kind: "const" }, { name: "p", t: "f32", kind: "const" },
    ],
    body: [
      let_("a", VEC2, op("add", VEC2, uv, op("mul", VEC2, k, uv))),
      let_("b", VEC2, op("mul", VEC2, local("a", VEC2), f32(2))),
      let_("s", "f32", { k: "field", of: local("b", VEC2), name: "x", t: "f32", span: S }),
      let_("n", VEC2, op("neg", VEC2, op("div", VEC2, local("b", VEC2), local("s", "f32")))),
      let_("e", "f32", op("f32", "f32", d)),
      let_("g", "f64", op("f64", "f64", op("add", "f32", local("s", "f32"), local("e", "f32")))),
      let_("q", VEC2, { k: "vec", items: [local("s", "f32"), f32(0.1)], t: VEC2, span: S }),
      let_("h", COLOR, op("mul", COLOR, c, c)),
      let_("p", "f32", op("pow", "f32", local("s", "f32"), op("rem", "f32", local("e", "f32"), f32(3)))),
      { k: "if", test: op("lt", "bool", local("s", "f32"), local("e", "f32")), then: [{ k: "return", value: c, span: S, effects: [] }], else: [], span: S, effects: [] },
      { k: "return", value: local("h", COLOR), span: S, effects: [] },
    ],
    effects: [],
    src: SRC,
    span: [0, 200],
  };
}

/**
 * A deep copy of `k`, changed by `fn`.
 * @param {Kernel} k
 * @param {(k: any) => void} fn
 * @returns {Kernel}
 */
function broken(k, fn) {
  const copy = structuredClone(k);
  fn(copy);
  return copy;
}

/** @param {unknown} k */
const codes = (k) => [...new Set(verify(/** @type {Kernel} */ (k)).map((d) => d.code))].sort();

test("f32 and vector types print compactly: a Dialect's by its name, a structural one by its shape", () => {
  assert.equal(showType("f32"), "f32");
  assert.equal(showType(VEC2), "vec2");
  assert.equal(showType(COLOR), "color");
  assert.equal(showType({ vec: 3, of: "f32" }), "f32x3");
  assert.equal(showType({ vec: 4, of: "f64" }), "f64x4");
  assert.equal(showType({ opt: VEC2 }), "vec2?");
});

test("dialectVector makes a nominal vector: a name over a structural shape", () => {
  assert.deepEqual(dialectVector("color", 3, "f32"), { vec: 3, of: "f32", name: "color" });
});

test("no implicit conversion and nominal vectors: f32 and f64, or vec3 and color (both three f32s), never join or assign", () => {
  assert.equal(assignable("f32", "f64"), false);
  assert.equal(assignable("f64", "f32"), false);
  assert.equal(strictJoin("f32", "f64"), null);
  assert.equal(strictJoin(VEC3, COLOR), null);
  assert.equal(strictJoin(VEC3, { vec: 3, of: "f32" }), null, "nor a Dialect type and its structural shape");
  assert.equal(assignable(COLOR, VEC3), false);
  assert.equal(assignable({ vec: 3, of: "f32" }, COLOR), false);
  assert.deepEqual(strictJoin(COLOR, COLOR), COLOR);
  assert.deepEqual(strictJoin(COLOR, { opt: COLOR }), { opt: COLOR });
  assert.deepEqual(join(VEC3, COLOR), { union: [VEC3, COLOR] }, "the general join keeps them apart too");
});

test("the vector kernel verifies clean, and its JSON form reads back the same", () => {
  const k = vrich();
  assert.deepEqual(verify(k), []);
  assert.deepEqual(JSON.parse(formatJSON(k)), k);
});

test("the listing marks f32 and vector operations with their type; f64 ones print as before", () => {
  const text = printKernel(vrich());
  assert.match(text, /^kernel pixel\(vrich\)\(uv: vec2, k: f32, c: color, d: f64\) -> color/);
  assert.match(text, /let a: vec2 = add\.vec2\(uv, mul\.vec2\(k, uv\)\)/);
  assert.match(text, /let b: vec2 = mul\.vec2\(a, 2\)/);
  assert.match(text, /let s: f32 = b\.x/);
  assert.match(text, /let n: vec2 = neg\.vec2\(div\.vec2\(b, s\)\)/);
  assert.match(text, /let e: f32 = f32\(d\)/);
  assert.match(text, /let g: f64 = f64\(add\.f32\(s, e\)\)/);
  assert.match(text, /let q: vec2 = vec2\(s, 0\.1\)/, "an f32 literal prints as the shortest decimal that rounds to it");
  assert.match(text, /let h: color = mul\.color\(c, c\)/);
  assert.match(text, /if lt\.f32\(s, e\) \{/);
});

test("f32Text is the shortest decimal that reads back as the same f32", () => {
  assert.equal(f32Text(Math.fround(0.1)), "0.1");
  assert.equal(f32Text(Math.fround(5.2)), "5.2");
  assert.equal(f32Text(2), "2");
  assert.equal(f32Text(Math.fround(-1.5e-7)), "-1.5e-7");
  assert.equal(f32Text(Math.fround(3.4e38)), "3.4e+38");
  for (const v of [0.1, 1 / 3, 16777217, 1e-40, 123.456]) assert.equal(Math.fround(Number(f32Text(Math.fround(v)))), Math.fround(v), String(v));
});

test("V001: a vec node without its items", () => {
  assert.ok(!codes(vrich()).includes("V001"), "a vec node with its items is a known kind");
  assert.deepEqual(codes(broken(vrich(), (k) => { delete k.body[6].value.items; })), ["V001"]);
});

test("V002: componentwise arithmetic takes two of one vector type, or two of one scalar type", () => {
  const r = vrich();
  assert.deepEqual(codes(broken(r, (k) => { k.body[7].value.args[1] = local("uv", VEC2); })), ["V002"], "color times vec2");
  assert.deepEqual(codes(broken(r, (k) => { k.body[7].value.args[1].t = VEC3; k.body[7].value.args[1].name = "x"; k.params.push({ name: "x", t: VEC3, kind: "param" }); })), ["V002"], "color times vec3: same shape, nominal types");
  assert.deepEqual(codes(broken(r, (k) => { k.body[7].value.args[1].t = { vec: 3, of: "f32" }; k.body[7].value.args[1].name = "x"; k.params.push({ name: "x", t: { vec: 3, of: "f32" }, kind: "param" }); })), ["V002"], "color times its structural shape");
  assert.deepEqual(codes(broken(r, (k) => { k.body[5].value.args[0].args[1] = local("d", "f64"); })), ["V002"], "f32 plus f64");
  assert.deepEqual(codes(broken(r, (k) => { k.body[0].value.args[1].args[0] = local("d", "f64"); })), ["V002"], "an f64 times a vector of f32");
  assert.deepEqual(codes(broken(r, (k) => { k.body[0].value.args[1] = local("k", "f32"); })), ["V002"], "a vector plus a scalar");
  assert.deepEqual(codes(broken(r, (k) => { k.body[3].value.args[0].args = [local("s", "f32"), local("b", VEC2)]; })), ["V002"], "a scalar divided by a vector");
  assert.deepEqual(codes(broken(r, (k) => { k.body[0].value.t = { vec: 2, of: "f32" }; k.body[0].t = k.body[0].value.t; k.locals[0].t = k.body[0].value.t; k.body[1].value.args[0].t = k.body[0].value.t; })), ["V002"], "vec2 plus vec2 typed as the structural shape");
  assert.deepEqual(codes(broken(r, (k) => { k.body[5].value.args[0].t = "f64"; })), ["V002"], "f32 plus f32 typed f64");
  assert.deepEqual(codes(broken(r, (k) => { k.body[8].value.op = "band"; k.body[8].value.args[1] = local("e", "f32"); })), ["V002"], "a bitwise op on f32");
  assert.deepEqual(codes(broken(r, (k) => { k.body[7].value.op = "rem"; })), ["V002"], "rem on vectors");
  assert.deepEqual(codes(broken(r, (k) => { k.body[3].value.args = [local("s", "f32")]; k.body[3].value.t = "f32"; k.body[3].t = "f32"; k.locals[3].t = "f32"; })), [], "neg of an f32 is an f32");
  assert.deepEqual(codes(broken(r, (k) => { k.body[3].value.op = "bnot"; })), ["V002"], "bnot of a vector");
});

test("V002: conversions go between f64 and f32 only, and are never a no-op", () => {
  const r = vrich();
  assert.deepEqual(codes(broken(r, (k) => { k.body[4].value.args[0] = local("k", "f32"); })), ["V002"], "f32 of an f32");
  assert.deepEqual(codes(broken(r, (k) => { k.body[5].value.args[0] = local("d", "f64"); })), ["V002"], "f64 of an f64");
  assert.deepEqual(codes(broken(r, (k) => { k.body[4].value.t = "f64"; })), ["V002"], "f32 typed f64");
  assert.deepEqual(codes(broken(r, (k) => { k.body[5].value.args[0] = local("uv", VEC2); })), ["V002"], "f64 of a vector");
});

test("V002: f32 literals, construction and component access", () => {
  const r = vrich();
  assert.deepEqual(codes(broken(r, (k) => { k.body[6].value.items[1].v = 0.1; })), ["V002"], "an f32 literal whose value is not an f32");
  assert.deepEqual(codes(broken(r, (k) => { k.body[6].value.items.push(f32(1)); })), ["V002"], "three items for a vec2");
  assert.deepEqual(codes(broken(r, (k) => { k.body[6].value.items[1] = f64(0.5); })), ["V002"], "an f64 item in a vector of f32");
  assert.deepEqual(codes(broken(r, (k) => { k.body[6].value.t = "f32"; k.body[6].t = "f32"; k.locals[6].t = "f32"; })), ["V002"], "a vec node typed as a scalar");
  assert.deepEqual(codes(broken(r, (k) => { k.body[2].value.name = "z"; })), ["V002"], "a vec2 has no z");
  assert.deepEqual(codes(broken(r, (k) => { k.body[2].value.name = "y"; })), [], "but has a y");
  assert.deepEqual(codes(broken(r, (k) => { k.body[2].value.name = "xy"; })), ["V002"], "no swizzles");
  assert.deepEqual(codes(broken(r, (k) => { k.body[2].value.t = "f64"; k.body[2].t = "f64"; k.locals[2].t = "f64"; for (const a of [k.body[3].value.args[0].args[1], k.body[5].value.args[0].args[0], k.body[6].value.items[0], k.body[8].value.args[0], k.body[9].test.args[0]]) a.t = "f64"; })), ["V002"], "a component of an f32 vector typed f64");
});

test("V002: f32 compares with f32 only; vectors are not compared, tested or ordered", () => {
  const r = vrich();
  assert.deepEqual(codes(broken(r, (k) => { k.body[9].test.args[1] = local("d", "f64"); })), ["V002"], "f32 less than f64");
  assert.deepEqual(codes(broken(r, (k) => { k.body[9].test.args = [local("uv", VEC2), local("uv", VEC2)]; })), ["V002"], "vec2 less than vec2");
  assert.deepEqual(codes(broken(r, (k) => { k.body[9].test.op = "eq"; k.body[9].test.args = [local("uv", VEC2), local("uv", VEC2)]; })), ["V002"], "vec2 equals vec2");
  assert.deepEqual(codes(broken(r, (k) => { k.body[9].test.op = "eq"; })), [], "f32 equals f32");
  assert.deepEqual(codes(broken(r, (k) => { k.body[9].test.op = "truthy"; k.body[9].test.args = [local("uv", VEC2)]; })), ["V002"], "a vector tested for truthiness");
});

test("V003: a vector has 2, 3 or 4 components of f32 or f64, and a Dialect's has a name", () => {
  const r = vrich();
  /** @param {unknown} t */
  const typed = (t) => broken(r, (k) => { k.params[0].t = t; });
  for (const [t, why] of /** @type {const} */ ([
    [{ vec: 5, of: "f32" }], [{ vec: 1, of: "f32" }], [{ vec: 2.5, of: "f32" }],
    [{ vec: 2, of: "u8" }, "no integer vectors"], [{ vec: 2, of: VEC2 }, "no vectors of vectors"],
    [{ vec: 2, of: "f32", name: "" }, "an empty name"], [{ vec: 2, of: "f32", name: 3 }],
  ])) assert.ok(codes(typed(t)).includes("V003"), why ?? JSON.stringify(t));
});

test("in a partial kernel an unknown operand yields to the other: f64 as in M1, f32, or a vector", () => {
  const u = local("u", "unknown");
  const k = broken(vrich(), (k) => {
    k.params.push({ name: "u", t: "unknown", kind: "param" });
    k.body[4].value = op("f32", "f32", op("add", "f64", u, local("d", "f64")));
    k.body[5].value.args[0] = op("add", "f32", u, local("s", "f32"));
    k.body[0].value.args[1] = op("mul", VEC2, u, local("uv", VEC2));
  });
  assert.deepEqual(verify(k, { partial: true }), []);
});
