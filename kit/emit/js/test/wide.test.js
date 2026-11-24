// f32 and vector emission, node by node: each emitted function must give exactly what the
// reference interpreter gives (`Object.is`-equal, so -0 and NaN count), including the rounding.
import { test } from "node:test";
import assert from "node:assert/strict";
import { emitKernel, instantiate, emitHelpers } from "../index.js";
import { run } from "../../../interp/index.js";
import { INTRINSICS, lowerField, field } from "../../../dialects/fields/index.js";
import { num, f32, op, vec, field as fld, local, global, load, place, cond, call, helper, let_, set, ret, kernel, returning } from "../../../interp/test/build.js";

/** @import { Expr, Type, Kernel } from "../../../ir/ir.js" */

const V3 = /** @type {Type} */ ({ vec: 3, of: "f32", name: "vec3" });
const OPTS = { intrinsics: INTRINSICS };

/** Inputs that a double-precision implementation would round differently from f32. */
const SCALARS = [0.1, -0.1, 1 / 3, 1e30, -1e-40, 16777217, 0, -0, 2.5, 1e38];

/**
 * Runs `k` in the interpreter and as emitted JS, and asserts the two agree exactly.
 * @param {Kernel} k
 * @param {unknown[]} inputs
 * @param {{ helpers?: Record<string, Kernel> }} [env]
 */
function same(k, inputs, env = {}) {
  const want = run(k, structuredClone(inputs), { intrinsics: INTRINSICS, helpers: env.helpers });
  const scope = env.helpers ? emitHelpers(Object.values(env.helpers).map((h) => emitKernel(h, OPTS))) : {};
  const emitted = emitKernel(k, OPTS);
  const got = instantiate(emitted, scope)(...structuredClone(inputs));
  assert.deepStrictEqual(got, want, `${JSON.stringify(inputs)}\n${emitted.source}`);
  return got;
}

const X = local("x", "f32"), Y = local("y", "f32"), A = local("a"), P = local("p", V3), Q = local("q", V3);
const params = /** @type {Array<[string, Type]>} */ ([["x", "f32"], ["y", "f32"], ["a", "f64"], ["p", V3], ["q", V3]]);
/** @param {Expr} e */
const k1 = (e) => returning(e, params);
const VECS = [[0.1, 0.2, 0.3], [1e30, -1e30, 1 / 3], [16777217, 0, -0]];

test("a binary f32 operator is the double operation rounded once", () => {
  for (const o of /** @type {const} */ (["add", "sub", "mul", "div", "rem"])) {
    const k = k1(op(o, "f32", X, Y));
    for (const x of SCALARS) for (const y of SCALARS) same(k, [x, y, 0, [0, 0, 0], [0, 0, 0]]);
  }
  same(k1(op("pow", "f32", X, Y)), [0.7, 1.9, 0, [0, 0, 0], [0, 0, 0]]);
  same(k1(op("pow", "f32", X, Y)), [3, 40, 0, [0, 0, 0], [0, 0, 0]]);
});

test("neg and pos on an f32", () => {
  for (const x of SCALARS) {
    same(k1(op("neg", "f32", X)), [x, 0, 0, [0, 0, 0], [0, 0, 0]]);
    same(k1(op("pos", "f32", X)), [x, 0, 0, [0, 0, 0], [0, 0, 0]]);
  }
});

test("comparisons of f32s", () => {
  for (const o of /** @type {const} */ (["eq", "ne", "lt", "le", "gt", "ge"])) {
    for (const [x, y] of [[0.1, 0.1], [0.1, 0.2], [0, -0], [NaN, NaN]]) same(k1(op(o, "bool", X, Y)), [x, y, 0, [0, 0, 0], [0, 0, 0]]);
  }
});

test("the f32 op rounds an f64; the f64 op widens an f32 exactly", () => {
  for (const a of SCALARS) {
    same(k1(op("f32", "f32", A)), [0, 0, a, [0, 0, 0], [0, 0, 0]]);
    same(k1(op("f64", "f64", X)), [a, 0, 0, [0, 0, 0], [0, 0, 0]]);
  }
});

test("a parameter is rounded to its type on the way in", () => {
  assert.equal(same(k1(X), [0.1, 0, 0, [0, 0, 0], [0, 0, 0]]), Math.fround(0.1));
  same(k1(P), [0, 0, 0, [0.1, 0.2, 0.3], [0, 0, 0]]);
});

test("an f32 literal is emitted as itself", () => {
  same(k1(f32(0.1)), [0, 0, 0, [0, 0, 0], [0, 0, 0]]);
  same(k1(op("add", "f32", f32(0.1), f32(0.2))), [0, 0, 0, [0, 0, 0], [0, 0, 0]]);
});

test("a vec node, and a component read of a vector", () => {
  same(k1(vec([X, Y, op("add", "f32", X, Y)], "f32", "vec3")), [0.1, 0.2, 0, [0, 0, 0], [0, 0, 0]]);
  for (const n of ["x", "y", "z"]) same(k1(fld(P, n, "f32")), [0, 0, 0, VECS[1], [0, 0, 0]]);
});

test("a vector's arithmetic is componentwise, with a scalar on the sides the IR allows", () => {
  for (const a of VECS) for (const b of VECS) {
    const inputs = [0.1, 0.3, 0, a, b];
    same(k1(op("add", V3, P, Q)), inputs);
    same(k1(op("sub", V3, P, Q)), inputs);
    same(k1(op("mul", V3, P, Q)), inputs);
    same(k1(op("div", V3, P, Q)), inputs);
    same(k1(op("mul", V3, X, P)), inputs);
    same(k1(op("mul", V3, P, Y)), inputs);
    same(k1(op("div", V3, P, Y)), inputs);
  }
  for (const a of VECS) {
    same(k1(op("neg", V3, P)), [0, 0, 0, a, a]);
    same(k1(op("pos", V3, P)), [0, 0, 0, a, a]);
  }
});

test("a vector local is set whole, and a conditional picks a vector", () => {
  const k = kernel({
    params, returns: V3,
    body: [
      let_("d", V3, op("mul", V3, X, P)),
      set("d", vec([fld(local("d", V3), "y", "f32"), fld(local("d", V3), "x", "f32"), op("add", "f32", X, Y)], "f32", "vec3")),
      ret(cond(op("lt", "bool", X, Y), local("d", V3), op("sub", V3, local("d", V3), Q), V3)),
    ],
  });
  same(k, [0.1, 0.9, 0, VECS[0], VECS[1]]);
  same(k, [0.9, 0.1, 0, VECS[0], VECS[1]]);
});

test("a global or a loaded place is rounded to its type, as the interpreter rounds it", () => {
  const u = { k: 0.1 };
  const kLoad = kernel({ params: [["u", { obj: "U" }]], returns: "f32", body: [ret(op("add", "f32", load(place(local("u", { obj: "U" }), "U", "k", "f32")), f32(0.2)))] });
  assert.equal(same(kLoad, [u]), Math.fround(Math.fround(0.1) + Math.fround(0.2)));
  const g = kernel({ returns: "f32", body: [ret(op("mul", "f32", global("G", "f32"), f32(3)))] });
  const want = run(g, [], { globals: { G: 0.1 } });
  assert.equal(instantiate(emitKernel(g), { G: 0.1 })(), want);
});

test("a helper that takes and returns vectors is called by name", () => {
  const h = kernel({ name: "twice", params: [["v", V3]], returns: V3, body: [ret(op("mul", V3, f32(2), local("v", V3)))] });
  const k = k1(helper("twice", V3, [op("add", V3, P, Q)]));
  same(k, [0, 0, 0, VECS[0], VECS[1]], { helpers: { twice: h } });
});

test("a vector the lambda reads before assigning keeps its f64 components when it is an f64 vector", () => {
  const D = /** @type {Type} */ ({ vec: 2, of: "f64" });
  const k = returning(op("add", D, local("v", D), local("v", D)), [["v", D]]);
  same(k, [[0.1, 0.2]]);
});

test("emitted source is the same for DMG-shaped kernels: no prelude, no rounding", () => {
  const k = kernel({ params: [["a", "f64"]], returns: "f64", body: [ret(op("add", "f64", local("a"), num(1)))] });
  const e = emitKernel(k);
  assert.deepEqual(e.prelude, []);
  assert.doesNotMatch(e.source, /fround|\$/);
});

// ---- intrinsics, through lowered fields Programs ------------------------------------------

/**
 * Lowers `pixel` as a fields Program and returns its kernel and helper kernels.
 * @param {string} src  A pixel lambda `(uv, u) => ...`.
 */
function lowered(src) {
  const r = lowerField(field("t").param("k", { value: 2, min: 0, max: 8 }).pixel(src).build());
  assert.deepEqual(r.pixel.diagnostics.map((d) => d.message), [], src);
  /** @type {Record<string, Kernel>} */
  const helpers = {};
  for (const h of r.helpers) if (h.kind === "fn" && h.result.kernel) helpers[h.name] = h.result.kernel;
  return { kernel: /** @type {Kernel} */ (r.kernel), helpers };
}

test("a loop over an f32 counter, with f32 and vector accumulators, rounds each step", () => {
  const { kernel: k } = lowered(`(uv, u) => {
  let s = 0;
  let v = uv;
  for (let i = 0; i < 7; i++) {
    s += u.k * 0.1 * i;
    v = v * 0.9 + vec2(s, i);
  }
  return color(s, v.x, v.y);
}`);
  const e = emitKernel(k, OPTS);
  for (const uv of UVS) assert.deepStrictEqual(instantiate(e)(uv, U), run(k, [uv, U], { intrinsics: INTRINSICS }), e.source);
});

const UVS = [[0.1, 0.9], [-1.5, 2.25], [1 / 3, 1e3], [0, 0]];
const U = { k: 2.7, t: 0.35, aspect: 1.5 };

/** Each intrinsic in the shapes it takes: `s` has a scalar result, `v` a vec2 one. */
const INTRINSIC_PIXELS = /** @type {Record<string, Array<["s" | "v", string]>>} */ ({
  floor: [["s", "floor(uv.x)"], ["v", "floor(uv)"]],
  fract: [["s", "fract(uv.y)"], ["v", "fract(uv * 1.7)"]],
  abs: [["s", "abs(uv.x)"], ["v", "abs(uv)"]],
  min: [["s", "min(uv.x, u.k)"], ["v", "min(uv, vec2(uv.y, uv.x))"]],
  max: [["s", "max(uv.x, u.k)"], ["v", "max(uv, vec2(0.2, 0.3))"]],
  clamp: [["s", "clamp(uv.x, 0, u.k)"], ["v", "clamp(uv, 0.1, 0.8)"]],
  mix: [["s", "mix(uv.x, uv.y, u.k)"], ["v", "mix(uv, vec2(1, 2), 0.3)"]],
  sin: [["s", "sin(uv.x * 3)"]], cos: [["s", "cos(uv.x * 3)"]], sqrt: [["s", "sqrt(abs(uv.x))"]],
  pow: [["s", "pow(abs(uv.x), u.k)"]], atan2: [["s", "atan2(uv.y, uv.x)"]],
  smoothstep: [["s", "smoothstep(0.1, 0.9, uv.x)"]],
  length: [["s", "length(uv)"], ["s", "length(vec3(uv.x, uv.y, u.k))"]],
  ihash: [["s", "ihash(floor(uv.x * 7), floor(uv.y * 7), u.k)"]],
  // The call style's vector arithmetic (fields/calls.js).
  vadd: [["s", "vadd(uv.x, u.k)"], ["v", "vadd(uv, vec2(0.3, 0.7))"]],
  vsub: [["s", "vsub(uv.x, u.k)"], ["v", "vsub(uv, vec2(0.3, 0.7))"]],
  vmul: [["s", "vmul(uv.x, u.k)"], ["v", "vmul(uv, vec2(0.3, 0.7))"]],
  vdiv: [["s", "vdiv(uv.x, u.k)"], ["v", "vdiv(uv, vec2(3, 7))"]],
  vscale: [["s", "vscale(uv.x, u.k)"], ["v", "vscale(uv, 0.3)"]],
  vneg: [["s", "vneg(uv.x)"], ["v", "vneg(uv)"]],
});

test("every fields intrinsic is tested here", () => {
  assert.deepEqual(Object.keys(INTRINSIC_PIXELS).sort(), Object.keys(INTRINSICS).sort());
});

for (const [name, shapes] of Object.entries(INTRINSIC_PIXELS)) {
  test(`intrinsic ${name} emits in its JS spelling and agrees with the reference`, () => {
    for (const [kind, shape] of shapes) {
      const body = kind === "s" ? `{ const v = ${shape}; return color(v, v, v); }` : `{ const v = ${shape}; return color(v.x, v.y, 0); }`;
      const { kernel: k, helpers } = lowered(`(uv, u) => ${body}`);
      const e = emitKernel(k, OPTS);
      const fn = instantiate(e, emitHelpers(Object.values(helpers).map((h) => emitKernel(h, OPTS))));
      for (const uv of UVS) {
        const want = run(k, [uv, U], { intrinsics: INTRINSICS, helpers });
        assert.deepStrictEqual(fn(uv, U), want, `${shape} at ${uv}\n${e.source}`);
      }
    }
  });
}

test("a call to an intrinsic the spelling table does not know is emitted as a plain call", () => {
  const k = kernel({ params: [["a", "f64"]], returns: "f64", body: [ret(call("sqrt", "f64", [local("a")], { recv: global("sqrt", { obj: "sqrt" }) }))] });
  assert.match(emitKernel(k).source, /sqrt\(a\)/);
});

test("a template that uses an argument twice is refused for an impure argument", () => {
  const bad = { twice: { sig: /** @type {any} */ ({}), js: { call: "($0 + $0)" }, glsl: { call: "" }, ref: () => 0 } };
  const k = kernel({ params: [["a", "f32"]], returns: "f32", body: [ret(call("twice", "f32", [helper("h", "f32", [])], { recv: global("twice", { obj: "twice" }) }))] });
  assert.throws(() => emitKernel(k, { intrinsics: bad }), /more than once/);
});
