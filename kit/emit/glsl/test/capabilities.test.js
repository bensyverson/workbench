// What the GLSL target cannot take is refused with the proposal's capability message (§6): the
// kernel by name, why, and what the target does accept. Whatever it can take still emits.
import { test } from "node:test";
import assert from "node:assert/strict";
import { emitGlsl } from "../index.js";
import { FIELDS_DIALECT } from "../../../dialects/fields/index.js";
import * as c from "../../../interp/test/build.js";

/** @import { Type, Kernel } from "../../../ir/ir.js" */

const U = /** @type {Type} */ ({ obj: "Uniforms" });
const VEC2 = /** @type {Type} */ ({ vec: 2, of: "f32", name: "vec2" });
const COLOR = /** @type {Type} */ ({ vec: 3, of: "f32", name: "color" });
const UNIFORMS = { Uniforms: { a: /** @type {Type} */ ("f32") } };

/** @param {Kernel} k @param {string} [space] a kernel in the pixel space, as lowering makes it */
const inPixel = (k, space = "pixel") => ({ ...k, space });

/** @param {Kernel} main @param {Kernel[]} [helpers] */
const emit = (main, helpers = []) => emitGlsl({ name: main.name, kernel: main, helpers, uniforms: UNIFORMS }, FIELDS_DIALECT);

/** A pixel kernel that returns a color of its uniform. @param {import("../../../ir/ir.js").Stmt[]} [before] */
const pixel = (before = []) => inPixel(c.kernel({ name: "Mole.onFrame#0", params: [["uv", VEC2], ["u", U]], returns: COLOR, body: [
  ...before,
  c.ret(c.vec([c.load(c.place(c.local("u", U), "Uniforms", "a", "f32")), c.f32(0), c.f32(0)], "f32", "color")),
] }));

test("a pure pixel kernel that reads a uniform is accepted", () => {
  const r = emit(pixel());
  assert.deepEqual(r.diagnostics, []);
  assert.ok(r.source);
});

test("T001: a kernel that writes entity state and emits an event is refused, in the proposal's words", () => {
  const write = c.store(c.place(c.local("self", { ref: "Mole" }), "Mole", "ttl", "f64", { type: "f64" }), c.num(1));
  const k = inPixel(c.kernel({ name: "Mole.onFrame#0", params: [["uv", VEC2], ["u", U], ["self", { ref: "Mole" }]], returns: COLOR, body: [
    write, c.ret(c.vec([c.f32(0), c.f32(0), c.f32(0)], "f32", "color")),
  ] }));
  const emits = { ...k, effects: /** @type {import("../../../ir/ir.js").Effect[]} */ ([...k.effects, "emit whack"]) };
  const r = emit(emits);
  assert.equal(r.source, null);
  assert.deepEqual(r.diagnostics.map((d) => d.code), ["T001"]);
  assert.equal(r.diagnostics[0].message, "Target `glsl` cannot take `Mole.onFrame#0`: it writes entity state and emits an event. Shader targets accept pure kernels over `pixel`.");
});

test("T001: a kernel over a space the target does not accept is refused", () => {
  const k = c.kernel({ name: "Mole.onFrame#0", params: [["uv", VEC2]], returns: COLOR, body: [c.ret(c.vec([c.f32(0), c.f32(0), c.f32(0)], "f32", "color"))] });
  const r = emit({ ...k, space: "entity Mole" });
  assert.equal(r.source, null);
  assert.equal(r.diagnostics[0].message, "Target `glsl` cannot take `Mole.onFrame#0`: it runs over `entity Mole`. Shader targets accept pure kernels over `pixel`.");
});

test("T001: a read of state that is not a declared uniform, and a call that is not a helper", () => {
  const reads = { ...pixel(), effects: /** @type {import("../../../ir/ir.js").Effect[]} */ (["read Mole.ttl"]) };
  assert.match(emit(reads).diagnostics[0].message, /it reads entity state\./);
  const calls = { ...pixel(), effects: /** @type {import("../../../ir/ir.js").Effect[]} */ (["call mystery"]) };
  assert.match(emit(calls).diagnostics[0].message, /it calls `mystery`, which is not a helper of this program\./);
  const rng = { ...pixel(), effects: /** @type {import("../../../ir/ir.js").Effect[]} */ (["rng"]) };
  assert.match(emit(rng).diagnostics[0].message, /it draws random numbers\./);
});

test("a read of a declared uniform, and a call of a helper that was given, are not effects the target refuses", () => {
  const ok = { ...pixel(), effects: /** @type {import("../../../ir/ir.js").Effect[]} */ (["read Uniforms.a"]) };
  assert.deepEqual(emit(ok).diagnostics, []);
});

test("T001: an effectful helper is refused too, named", () => {
  const helper = c.kernel({ name: "noisy", params: [["x", "f32"]], returns: "f32", body: [c.ret(c.local("x", "f32"))] });
  const bad = { ...helper, space: "helper noisy", effects: /** @type {import("../../../ir/ir.js").Effect[]} */ (["rng"]) };
  const main = { ...inPixel(c.kernel({ name: "p#0", params: [["uv", VEC2]], returns: COLOR, body: [c.let_("x", "f32", c.helper("noisy", "f32", [c.f32(1)])), c.ret(c.vec([c.local("x", "f32"), c.f32(0), c.f32(0)], "f32", "color"))] })), effects: /** @type {import("../../../ir/ir.js").Effect[]} */ (["call noisy"]) };
  const r = emit(main, [bad]);
  assert.equal(r.source, null);
  assert.match(r.diagnostics[0].message, /^Target `glsl` cannot take `noisy`: it draws random numbers\./);
});

test("R001 reaches the author as the same kind of message: the target, the kernel, why", () => {
  const k = inPixel(c.kernel({ name: "p#0", params: [["uv", VEC2]], returns: COLOR, body: [
    c.let_("x", "f64", c.num(1)), c.ret(c.vec([c.op("f32", "f32", c.local("x", "f64")), c.f32(0), c.f32(0)], "f32", "color")),
  ] }));
  const r = emit(k);
  assert.equal(r.source, null);
  assert.deepEqual(r.diagnostics.map((d) => d.code), ["R001"]);
  assert.match(r.diagnostics[0].message, /^Target `glsl` cannot take `p#0`: /);
});

test("a pixel kernel must return a color the output can hold", () => {
  const k = inPixel(c.kernel({ name: "p#0", params: [["uv", VEC2]], returns: "f32", body: [c.ret(c.f32(1))] }));
  const r = emit(k);
  assert.equal(r.source, null);
  assert.equal(r.diagnostics[0].code, "T001");
  assert.match(r.diagnostics[0].message, /returns f32, not a color/);
});
