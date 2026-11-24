// Where two values must share a type (a ternary's arms, an inferred return's returns) and
// the types are different numbers or vectors, lowering says so (L003) instead of joining
// them into a union; a literal arm takes the other arm's type. Also f32 stores.
import { test } from "node:test";
import assert from "node:assert/strict";
import { lowerLambda } from "../index.js";
import { dialectVector } from "../../ir/types.js";
import { printKernel } from "../../ir/print.js";

/** @import { Environment, SlotRef } from "../environment.js" */

const VEC2 = dialectVector("vec2", 2, "f32");
const VEC3 = dialectVector("vec3", 3, "f32");
const COLOR = dialectVector("color", 3, "f32");

/** @type {Environment} */
const environment = {
  name: "mixing (test)",
  objects: {
    W: { label: "W", members: { t: { kind: "value", t: "f32", store: { type: "f32" }, effect: "read W.t" } } },
  },
  list: {},
  queries: [],
  globals: { w: { obj: "W" } },
  vectors: { vec2: VEC2, vec3: VEC3, color: COLOR },
  conversions: { f32: "f32", f64: "f64" },
  slot: () => ({ params: [VEC2, "f32", COLOR, "f64", "bool", VEC3], returns: "infer", space: "pixel", forbid: [] }),
};

const P = "(uv, k, c, d, b, v3) =>";
/** @param {string} src */
const lower = (src) => lowerLambda(environment, src, /** @type {SlotRef} */ ({ id: "p.pixel", kind: "pixel", on: "p" }));

/**
 * Asserts `src` fails with exactly `code`, with a one-line tip containing `tip`; returns the diagnostic message.
 * @param {string} src
 * @param {RegExp} tip
 */
function rejected(src, tip) {
  const r = lower(`${P} ${src}`);
  assert.equal(r.kernel, null, src);
  assert.deepEqual(r.diagnostics.map((d) => d.code), ["L003"], `${src}: ${r.diagnostics.map((d) => d.message).join(" | ")}`);
  assert.match(r.diagnostics[0].tip, tip, src);
  assert.ok(!r.diagnostics[0].tip.includes("\n"));
  return r.diagnostics[0].message;
}

test("a ternary of an f32 and an f64 is rejected, naming both and the conversion", () => {
  const m = rejected("b ? k : d", /f64\(k\) or f32\(d\)/);
  assert.match(m, /f32/);
  assert.match(m, /f64/);
});

test("a ternary of two different vector types is rejected, naming both", () => {
  const m = rejected("b ? c : v3", /color\(/);
  assert.match(m, /color/);
  assert.match(m, /vec3/);
});

test("a ternary of a vector and a scalar is rejected", () => {
  rejected("b ? uv : k", /./);
});

test("a ternary's literal arm takes the other arm's type", () => {
  const r = lower(`${P} b ? k : 0.5`);
  assert.deepEqual(r.diagnostics, []);
  assert.equal(r.returns, "f32");
  assert.match(printKernel(/** @type {never} */ (r.kernel)), /0\.5/);
  assert.equal(lower(`${P} b ? 0.5 : k`).returns, "f32");
  assert.equal(lower(`${P} b ? -1 : k`).returns, "f32");
});

test("a ternary of two arms of one type keeps it, and so does one of two f64 literals", () => {
  assert.equal(lower(`${P} b ? k : k * 2`).returns, "f32");
  assert.deepEqual(lower(`${P} b ? uv : uv * 2`).returns, VEC2);
  assert.equal(lower(`${P} b ? d : 1`).returns, "f64");
});

test("two returns of an f32 and an f64 are rejected, at the second", () => {
  const r = lower(`${P} { if (b) return k; return d; }`);
  assert.equal(r.kernel, null);
  assert.deepEqual(r.diagnostics.map((d) => d.code), ["L003"]);
  assert.match(r.diagnostics[0].tip, /f32\(d\)/);
  assert.equal(`${P} { if (b) return k; return d; }`.slice(...r.diagnostics[0].range), "return d;");
});

test("two returns of different vector types are rejected", () => {
  const r = lower(`${P} { if (b) return c; return v3; }`);
  assert.equal(r.kernel, null);
  assert.deepEqual(r.diagnostics.map((d) => d.code), ["L003"]);
});

test("two returns of one type, and a return that may fall off the end, still infer", () => {
  assert.equal(lower(`${P} { if (b) return k; return k * 2; }`).returns, "f32");
  assert.deepEqual(lower(`${P} { if (b) return k; }`).returns, { opt: "f32" });
});

test("an f32 value stores into an f32 place; an f64 is an L003; a literal takes the place's type", () => {
  const ok = lower(`${P} { w.t = k * 2; }`);
  assert.deepEqual(ok.diagnostics, []);
  assert.deepEqual(lower(`${P} { w.t = 0.25; }`).diagnostics, []);
  assert.deepEqual(lower(`${P} { w.t += k; }`).diagnostics, []);
  const bad = lower(`${P} { w.t = d; }`);
  assert.deepEqual(bad.diagnostics.map((x) => x.code), ["L003"]);
  assert.match(bad.diagnostics[0].tip, /f32\(d\)/);
});
