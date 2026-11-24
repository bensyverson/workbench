// Lowering the nominal scalar: a Dialect's named type stored as an f64 (here `date` and `stamp`),
// which compares with its own kind and meets no arithmetic. Every other use is one L003 with a
// one-line tip. The environment is a stand-in written for these tests, not a real Dialect.
import { test } from "node:test";
import assert from "node:assert/strict";
import { lowerLambda } from "../index.js";
import { dialectScalar } from "../../ir/types.js";
import { printKernel } from "../../ir/print.js";

/** @import { Environment } from "../environment.js" */
/** @import { Kernel } from "../../ir/ir.js" */

const DATE = dialectScalar("date", "f64");
const STAMP = dialectScalar("stamp", "f64");

/** @type {Environment} */
const environment = {
  name: "scalars (test)",
  objects: {
    // An intrinsic that gives a date: how a scalar enters a Kernel besides a parameter.
    today: { label: "today", members: {}, call: { params: [], returns: DATE, effects: [] } },
    Row: { label: "a row", members: { due: { kind: "value", t: DATE } } },
  },
  list: {},
  queries: [],
  globals: { today: { obj: "today" } },
  // (a: date, b: date, s: stamp, n: f64, o: date?, k: f32, r: Row)
  slot: (ref) => ({ params: [DATE, DATE, STAMP, "f64", { opt: DATE }, "f32", { obj: "Row" }], returns: ref.kind === "pick" ? DATE : "infer", space: "row", forbid: [] }),
};

const P = "(a, b, s, n, o, k, r) =>";

/** @param {string} src @param {string} [kind] */
const lower = (src, kind = "keep") => lowerLambda(environment, src, { id: `t.${kind}`, kind, on: "t" });

/** @param {string} src @param {string} [kind] */
function ok(src, kind) {
  const r = lower(src, kind);
  assert.deepEqual(r.diagnostics.map((d) => `${d.code} ${d.message}`), [], src);
  return /** @type {Kernel} */ (r.kernel);
}

/** Lowers `src`, asserting exactly one L003 with a one-line tip, and returns it. @param {string} src */
function refused(src) {
  const r = lower(src);
  assert.equal(r.kernel, null, src);
  assert.deepEqual(r.diagnostics.map((d) => d.code), ["L003"], `${src}: ${r.diagnostics.map((d) => d.message).join(" | ")}`);
  const d = r.diagnostics[0];
  assert.ok(d.tip.length > 0 && !d.tip.includes("\n"), "a one-line fix");
  return d;
}

test("a scalar compares and tests equal with its own kind", () => {
  for (const o of ["<", "<=", ">", ">=", "===", "!=="]) {
    const k = ok(`${P} a ${o} b`);
    assert.equal(k.returns, "bool", o);
  }
  assert.match(printKernel(ok(`${P} a < b && r.due >= today()`)), /and\(lt\(a, b\), ge\(r\.due, today\(\)\)\)/);
});

test("a scalar is passed, stored in a local, returned and chosen as itself", () => {
  assert.deepEqual(ok(`${P} { const d = today(); return d; }`).returns, DATE);
  assert.deepEqual(ok(`${P} a < b ? a : b`, "pick").returns, DATE);
  assert.deepEqual(ok(`${P} r.due`, "pick").returns, DATE);
  // As an optional number does, an optional scalar narrows by its truthiness (JavaScript's: one stored as 0 reads as absent).
  assert.equal(ok(`${P} { const x = o; if (x && x < a) return true; return false; }`).returns, "bool");
});

test("a scalar never meets an arithmetic, sign, bitwise or update operator", () => {
  for (const o of ["+", "-", "*", "/", "%", "**", "&", "|", "^", "<<", ">>", ">>>"]) {
    const d = refused(`${P} a ${o} b`);
    assert.match(d.message, /date/, o);
    assert.match(refused(`${P} a ${o} 1`).message, /date/, `${o} literal`);
    assert.match(refused(`${P} n ${o} a`).message, /date/, `${o} f64 first`);
  }
  for (const u of ["-a", "+a", "~a"]) assert.match(refused(`${P} ${u}`).message, /date/, u);
  assert.match(refused(`${P} { let d = a; d++; return d; }`).message, /date/);
  assert.match(refused(`${P} { let d = a; d += 1; return d; }`).message, /date/);
  assert.match(refused(`${P} "due " + a`).message, /date/, "no concatenation either");
});

test("a scalar compares with no other type: not f64, f32, a literal or another scalar", () => {
  for (const o of ["<", "<=", ">", ">=", "===", "!=="]) {
    for (const other of ["n", "k", "0", "s", '"x"']) {
      const d = refused(`${P} a ${o} ${other}`);
      assert.match(d.message, /date/, `${o} ${other}`);
    }
    refused(`${P} n ${o} a`);
  }
  const d = refused(`${P} a < s`);
  assert.match(d.message, /stamp/);
});

test("a scalar is not tested as a condition, nor mixed with a number in a ternary", () => {
  const d = refused(`${P} a ? 1 : 0`);
  assert.match(d.tip, /compare/i);
  refused(`${P} !a`);
  refused(`${P} n > 0 ? a : 0`);
  refused(`${P} n > 0 ? a : s`);
});
