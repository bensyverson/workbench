// The sampler in the LIR: a uniform of type `sampler`, passed whole to an intrinsic or a helper's sampler parameter.
// A sampler held in a local, chosen by a ternary, compared or returned is refused (R002) when lowering, and is a W
// code when a hand-built program carries one.
import { test } from "node:test";
import assert from "node:assert/strict";
import { lowerToLir, verifyLir } from "../index.js";
import * as c from "../../interp/test/build.js";
import * as l from "./build.js";

/** @import { Type, Kernel } from "../../ir/ir.js" */
/** @import { Spelling, LType, LProgram } from "../lir.js" */

const VEC2 = /** @type {Type} */ ({ vec: 2, of: "f32", name: "vec2" });
const VEC4 = /** @type {Type} */ ({ vec: 4, of: "f32", name: "vec4" });
const U = /** @type {Type} */ ({ obj: "Uniforms" });
/** @type {Type} */
const SAMPLER = "sampler";

/** @type {Record<string, Spelling>} */
const SPELLINGS = { sample: { call: "texture($0, $1)" } };
const spell = (/** @type {string} */ fn) => SPELLINGS[fn] ?? null;
const UNIFORMS = { Uniforms: { atlas: SAMPLER, other: SAMPLER, k: /** @type {Type} */ ("f32") } };
const atlas = (name = "atlas") => c.load(c.place(c.local("u", U), "Uniforms", name, SAMPLER));
const uv = () => c.local("uv", VEC2);
const sample = (/** @type {import("../../ir/ir.js").Expr} */ img) => c.call("sample", VEC4, [img, uv()]);

/** A pixel kernel over `body`. @param {import("../../ir/ir.js").Stmt[]} body @returns {Kernel} */
const pixel = (body) => c.kernel({ name: "p#0", params: [["uv", VEC2], ["u", U]], returns: VEC4, body });

/**
 * A Kernel the core verifier refuses (its sampler rule), built without `c.kernel`'s check: the LIR must refuse it on its own.
 * @param {{ name?: string, params?: Array<[string, Type]>, returns?: Type, locals?: Array<[string, Type]>, body: import("../../ir/ir.js").Stmt[] }} o
 * @returns {Kernel}
 */
const unverified = ({ name = "p#0", params = [["uv", VEC2], ["u", U]], returns = VEC4, locals = [], body }) => ({
  ir: "kernel", name, slot: "test", space: "test", params: params.map(([n, t]) => ({ name: n, t, kind: /** @type {const} */ ("param") })), returns,
  locals: locals.map(([n, t]) => ({ name: n, t, kind: /** @type {const} */ ("const") })), body, effects: [], src: " ".repeat(100), span: [0, 1],
});

/** @param {Kernel} main @param {Kernel[]} [helpers] */
const lower = (main, helpers = []) => lowerToLir({ name: "t", main, helpers, uniforms: UNIFORMS }, { spell });

test("a sampler uniform passed to an intrinsic lowers: the uniform is a sampler, read whole as the argument", () => {
  const r = lower(pixel([c.ret(sample(atlas()))]));
  assert.deepEqual(r.diagnostics, []);
  const p = /** @type {LProgram} */ (r.program);
  assert.deepEqual(p.uniforms.find((u) => u.source === "atlas"), { name: "u_atlas", t: "sampler", source: "atlas" });
  const ret = p.main.body[0];
  assert.ok(ret.k === "return" && ret.value.k === "call");
  assert.deepEqual(ret.value.args[0], { k: "uniform", name: "u_atlas", t: "sampler", span: [0, 1] });
  assert.deepEqual(verifyLir(p), []);
});

test("a helper's sampler parameter lowers, and a call passes it a uniform", () => {
  const cell = c.kernel({ name: "cell", params: [["img", SAMPLER], ["uv", VEC2]], returns: VEC4, body: [c.ret(sample(c.local("img", SAMPLER)))] });
  const r = lower(pixel([c.ret(c.helper("cell", VEC4, [atlas(), uv()]))]), [cell]);
  assert.deepEqual(r.diagnostics, []);
  const p = /** @type {LProgram} */ (r.program);
  assert.deepEqual(p.helpers[0].params[0], { name: "img", t: "sampler" });
  assert.deepEqual(verifyLir(p), []);
});

test("a sampler held, chosen, compared or returned is R002, and the message says a sampler is only passed", () => {
  const cases = /** @type {Array<[string, Kernel, Kernel[]]>} */ ([
    ["held", unverified({ locals: [["s", SAMPLER]], body: [c.let_("s", SAMPLER, atlas()), c.ret(sample(c.local("s", SAMPLER)))] }), []],
    ["chosen", unverified({ body: [c.ret(sample(c.cond(c.bool(true), atlas(), atlas("other"), SAMPLER)))] }), []],
    ["compared", unverified({ body: [c.if_(c.op("eq", "bool", atlas(), atlas("other")), [c.ret(sample(atlas()))]), c.ret(sample(atlas()))] }), []],
    ["returned", unverified({ body: [c.ret(c.helper("id", VEC4, [atlas()]))] }), [unverified({ name: "id", params: [["img", SAMPLER]], returns: SAMPLER, body: [c.ret(c.local("img", SAMPLER))] })]],
  ]);
  for (const [what, main, helpers] of cases) {
    const r = lower(main, helpers);
    assert.equal(r.program, null, what);
    assert.ok(r.diagnostics.length > 0 && r.diagnostics.every((d) => d.code === "R002" || d.code === "R004"), `${what}: ${JSON.stringify(r.diagnostics)}`);
    assert.ok(r.diagnostics.some((d) => d.code === "R002" && /sampler/.test(d.message)), `${what}: ${JSON.stringify(r.diagnostics)}`);
  }
});

const S = /** @type {LType} */ ("sampler");
/** A main over `body` with a sampler uniform `u_atlas`. @param {import("../lir.js").LStmt[]} body */
const withSampler = (body, returns = /** @type {LType} */ ({ vec: 4 })) =>
  l.program({ main: l.kernel({ name: "main_", params: [["uv", l.VEC2]], returns, body }), uniforms: [{ name: "u_atlas", t: S, source: "atlas" }] });
const tex = (/** @type {import("../lir.js").LExpr} */ img) => l.call("sample", "texture($0, $1)", { vec: 4 }, [img, l.local("uv", l.VEC2)]);

test("verifyLir: a sampler uniform passed to a call verifies", () => {
  assert.deepEqual(verifyLir(withSampler([l.ret(tex(l.uniform("u_atlas", S)))])), []);
});

test("verifyLir: a sampler local is W003, a sampler anywhere but a call's argument W002, a sampler return W003", () => {
  const codes = (/** @type {LProgram} */ p) => [...new Set(verifyLir(p).map((d) => d.code))];
  assert.deepEqual(codes(withSampler([l.let_("s", S, l.uniform("u_atlas", S)), l.ret(tex(l.local("s", S)))])), ["W003"]);
  assert.deepEqual(codes(withSampler([l.if_(l.op("eq", "bool", l.uniform("u_atlas", S), l.uniform("u_atlas", S)), []), l.ret(tex(l.uniform("u_atlas", S)))])), ["W002"]);
  assert.deepEqual(codes(withSampler([l.ret(tex(l.cond(l.bool(true), l.uniform("u_atlas", S), l.uniform("u_atlas", S))))])), ["W002"]);
  // The return type and the returned value each break a rule.
  assert.deepEqual(codes(withSampler([l.ret(l.uniform("u_atlas", S))], S)), ["W003", "W002"]);
});
