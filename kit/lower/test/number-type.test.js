// The Environment's default number type (`numberType`): where nothing gives a number literal
// a type, the Dialect's default applies; ++/-- and for counters follow it; vectors may have
// alias component names (`c.r`) and a let vector's component may be assigned; a generic
// intrinsic takes its type from its arguments, a literal included.
import { test } from "node:test";
import assert from "node:assert/strict";
import { lowerLambda, lowerProgram } from "../index.js";
import { dialectVector } from "../../ir/types.js";
import { printKernel } from "../../ir/print.js";

/** @import { Environment, SlotRef } from "../environment.js" */

const VEC2 = dialectVector("vec2", 2, "f32");
const COLOR = dialectVector("color", 3, "f32");
const T = { tvar: "T" };

/**
 * @param {"f32" | "f64" | undefined} numberType
 * @returns {Environment}
 */
const make = (numberType) => ({
  name: "number type (test)",
  objects: {
    mix: { label: "mix", members: {}, call: { params: [T, T, "f32"], returns: T, effects: [] } },
    big: { label: "big", members: {}, call: { params: [T, T], returns: T, effects: [], numeric: "number" } },
    len: { label: "len", members: {}, call: { params: [T], returns: "f32", effects: [], numeric: "vector" } },
  },
  list: {},
  queries: [],
  globals: { mix: { obj: "mix" }, big: { obj: "big" }, len: { obj: "len" } },
  vectors: { vec2: VEC2, color: COLOR },
  conversions: { f32: "f32", f64: "f64" },
  componentAliases: { color: { r: "x", g: "y", b: "z" } },
  ...(numberType ? { numberType } : {}),
  slot: (ref) => ref.kind === "helper"
    ? { params: [], inferParams: true, returns: "infer", space: "helper", forbid: [] }
    : ref.kind === "const"
      ? { params: [], returns: "infer", space: "const", forbid: [] }
      : { params: [VEC2, "f32", COLOR, "f64", "bool"], returns: "infer", space: "pixel", forbid: [] },
});
const f32 = make("f32");
const plain = make(undefined);

const P = "(uv, k, c, d, b) =>";
/** @param {Environment} env @param {string} src */
const lower = (env, src) => lowerLambda(env, `${P} ${src}`, /** @type {SlotRef} */ ({ id: "p.pixel", kind: "pixel", on: "p" }));
/** @param {Environment} env @param {string} src */
const ok = (env, src) => {
  const r = lower(env, src);
  assert.deepEqual(r.diagnostics.map((d) => `${d.code} ${d.message}`), [], src);
  return r;
};
/** @param {Environment} env @param {string} src @param {string} code */
const fails = (env, src, code) => {
  const r = lower(env, src);
  assert.equal(r.kernel, null, src);
  assert.deepEqual(r.diagnostics.map((d) => d.code), [code], `${src}: ${r.diagnostics.map((d) => d.message).join(" | ")}`);
  assert.ok(r.diagnostics[0].tip.length > 0 && !r.diagnostics[0].tip.includes("\n"));
  return r.diagnostics[0];
};

test("a let initialized by a literal takes the default number type", () => {
  assert.equal(ok(f32, "{ let x = 0.5; return x * k; }").returns, "f32");
  assert.equal(ok(f32, "{ const h = 0.5; return h * k; }").returns, "f32");
  assert.equal(ok(f32, "{ const h = 0.5 * 2; return h * k; }").returns, "f32", "arithmetic of literals is a literal");
  assert.equal(ok(f32, "{ let x = 0; x = k; return x; }").returns, "f32");
  assert.equal(ok(plain, "{ let x = 0.5; return x * d; }").returns, "f64");
});

test("with no declared default a literal is still f64, so a const meeting an f32 is an L003 with the fix", () => {
  const d = fails(plain, "{ const h = 0.5; return h * k; }", "L003");
  assert.match(d.tip, /f32\(h\)/);
});

test("the default type never converts a typed value: f32 meets f64 is L003 whose tip writes the fix", () => {
  const d = fails(f32, "k * d", "L003");
  assert.match(d.tip, /f64\(k\) or f32\(d\)/);
  assert.match(d.message, /f32/);
  assert.match(d.message, /f64/);
});

test("a literal out of the type's range is L016", () => {
  fails(f32, "{ let x = 1e39; return x; }", "L016");
  fails(f32, "uv * 1e39", "L016");
});

test("a ternary of literals, and the items of an array of literals, take the default", () => {
  assert.equal(ok(f32, "b ? 1 : 2").returns, "f32");
  assert.deepEqual(ok(f32, "[0.5, 1]").returns, { list: "f32", max: 2, len: 2 });
  assert.equal(ok(plain, "b ? 1 : 2").returns, "f64");
});

test("++ and -- count in the target's number type; for counters follow the default", () => {
  assert.equal(ok(f32, "{ let x = k; x++; --x; return x; }").returns, "f32");
  assert.equal(ok(f32, "{ let x = 0; x++; return x; }").returns, "f32");
  assert.equal(ok(plain, "{ let x = 0; x++; return x; }").returns, "f64");
  const r = ok(f32, "{ let s = 0; for (let i = 0; i < 4; i++) { s = s + i; } return s; }");
  assert.equal(r.returns, "f32");
  const loop = r.kernel?.body.find((s) => s.k === "for");
  assert.equal(loop?.k === "for" && loop.init.t, "f32");
  assert.equal(r.kernel?.locals.find((l) => l.name === "i")?.t, "f32");
  assert.equal(ok(plain, "{ let s = 0; for (let i = 0; i < 4; i++) { s = s + i; } return s; }").returns, "f64");
  assert.match(printKernel(/** @type {never} */ (r.kernel)), /for i = 0; lt\.f32\(i, 4\)/);
});

test("++ on a vector says what to do instead", () => {
  const d = fails(f32, "{ let v = uv; v++; return v; }", "L003");
  assert.match(d.message, /vec2/);
  assert.match(d.tip, /v\.x\+\+/);
});

test("a helper's argument that is a literal takes the default type", () => {
  const helper = { name: "twice", kind: /** @type {const} */ ("fn"), src: "(a) => a * 2" };
  const lambda = { src: `${P} twice(3) * k`, slot: /** @type {SlotRef} */ ({ id: "p.pixel", kind: "pixel", on: "p" }) };
  const r = lowerProgram(f32, [lambda], [helper]);
  assert.deepEqual(r.results[0].diagnostics.map((d) => d.code), []);
  assert.deepEqual(r.sigs.methods["$.twice"].params, ["f32"]);
  assert.equal(r.sigs.methods["$.twice"].returns, "f32");
});

test("a top-level constant stays untyped until each use, so it is f32 in one use and f64 in another", () => {
  const half = { name: "HALF", kind: /** @type {const} */ ("const"), src: "0.5" };
  const slot = /** @type {SlotRef} */ ({ id: "p.pixel", kind: "pixel", on: "p" });
  const run = (/** @type {string} */ body) => lowerProgram(f32, [{ src: `${P} ${body}`, slot }], [half]).results[0];
  assert.deepEqual(run("HALF * k").diagnostics, []);
  assert.equal(run("HALF * d").returns, "f64", "the same constant is an f64 where it meets one");
  assert.equal(run("HALF * k").returns, "f32");
  const folded = run("{ const x = HALF; return x; }");
  assert.equal(folded.returns, "f32", "a let from it takes the default");
});

test("a vector may name its components by aliases: c.r is c.x, and the IR says x", () => {
  const r = ok(f32, "c.r + c.g * c.b");
  assert.equal(r.returns, "f32");
  assert.match(printKernel(/** @type {never} */ (r.kernel)), /c\.x/);
  const d = fails(f32, "uv.r", "L002");
  assert.match(d.message, /vec2/);
});

test("a let vector's component may be assigned; any other is an L013 whose tip is about vectors", () => {
  const r = ok(f32, "{ let a = uv; a.x = 1; a.y += k; return a; }");
  assert.deepEqual(r.returns, VEC2);
  assert.match(printKernel(/** @type {never} */ (r.kernel)), /vec2\(1, a\.y\)/);
  const param = fails(f32, "{ uv.x = 1; return uv; }", "L013");
  assert.doesNotMatch(param.tip, /attr|ROM|runtime/i);
  assert.match(param.tip, /let/);
  const konst = fails(f32, "{ const a = uv; a.x = 1; return a; }", "L013");
  assert.match(konst.tip, /let/);
  const wrong = fails(f32, "{ let a = uv; a.x = d; return a; }", "L003");
  assert.match(wrong.tip, /f32\(d\)/);
});

test("vec2(uv) names the components to write", () => {
  const d = fails(f32, "vec2(uv)", "L015");
  assert.match(d.tip, /vec2\(uv\.x, uv\.y\)/);
});

test("a generic intrinsic takes its type from its arguments, a literal argument included", () => {
  assert.equal(ok(f32, "mix(1, k, 0.5)").returns, "f32");
  assert.equal(ok(f32, "mix(k, 1, 0.5)").returns, "f32");
  assert.deepEqual(ok(f32, "mix(uv, uv, 0.5)").returns, VEC2);
  assert.deepEqual(ok(f32, "mix(c, c, k)").returns, COLOR);
  const d = fails(f32, "mix(uv, c, 0.5)", "L003");
  assert.match(d.message, /color/);
  fails(f32, "mix(uv, 1, 0.5)", "L003");
});

test("a generic intrinsic may be limited to numbers, or to vectors", () => {
  assert.equal(ok(f32, "big(k, 2)").returns, "f32");
  assert.equal(ok(f32, "len(uv)").returns, "f32");
  const a = fails(f32, "big(b, b)", "L003");
  assert.match(a.message, /bool/);
  const v = fails(f32, "len(k)", "L003");
  assert.match(v.message, /vector/);
});
