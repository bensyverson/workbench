// An array literal, or a concatenation, lowered where a list of a union is expected (a draw list's ops): items of
// different struct types that each fit the expected item type make a list of that type, and an object literal
// checked against a union of structs is checked against the member its literal tag names.

import { test } from "node:test";
import assert from "node:assert/strict";
import { lowerLambda } from "../index.js";
import { run } from "../../interp/run.js";
import { emitKernel, instantiate } from "../../emit/js/index.js";

/** @import { Environment } from "../environment.js" */
/** @import { Type } from "../../ir/ir.js" */

const pt = /** @type {Type} */ ({ list: "f64", max: 2 });
const A = /** @type {Type} */ ({ struct: { op: { enum: ["a"] }, at: pt, n: "f64" } });
const B = /** @type {Type} */ ({ struct: { op: { enum: ["b"] }, at: pt, s: "str" }, optional: ["s"] });
const SHAPE = /** @type {Type} */ ({ union: [A, B] });

/** @param {Type} returns @returns {Environment} */
const env = (returns) => ({
  name: "expected (test)", objects: {}, list: {}, queries: [], globals: {},
  // (xs: shape[≤3], k: f64)
  slot: () => ({ params: [{ list: SHAPE, max: 3 }, "f64"], returns, space: "row", forbid: [] }),
});
/** @param {string} src @param {Type} returns */
const lower = (src, returns) => lowerLambda(env(returns), src, { id: "t.keep", kind: "keep", on: "t" });
/** @param {string} src @param {Type} returns */
const errors = (src, returns) => lower(src, returns).diagnostics.filter((d) => d.severity === "error").map((d) => `${d.code} ${d.message}`);

test("items of two struct types that each fit the expected union make a list of the union", () => {
  const want = /** @type {Type} */ ({ list: SHAPE, max: 10 });
  const src = '(xs, k) => [{ op: "a", at: [k, 0], n: 1 }, { op: "b", at: [0, k], s: "hi" }]';
  assert.deepEqual(errors(src, want), []);
  const k = /** @type {any} */ (lower(src, want).kernel);
  const ret = k.body.at(-1).value;
  assert.deepEqual(ret.t, { list: SHAPE, max: 2, len: 2 });
  const out = [{ op: "a", at: [2, 0], n: 1 }, { op: "b", at: [0, 2], s: "hi" }];
  assert.deepEqual(run(k, [[], 2]), out);
  assert.deepEqual(instantiate(emitKernel(k))([], 2), out);
});

test("a concatenation of a list of the union and plain items of its members sums the maxes", () => {
  const want = /** @type {Type} */ ({ list: SHAPE, max: 10 });
  const src = '(xs, k) => [{ op: "b", at: [0, 0] }, ...xs, { op: "a", at: [k, k], n: k }]';
  assert.deepEqual(errors(src, want), []);
  const ret = /** @type {any} */ (lower(src, want).kernel).body.at(-1).value;
  assert.equal(ret.k, "concat");
  assert.deepEqual(ret.t, { list: SHAPE, max: 5 });
});

test("an object literal against a union is checked against the member its tag names", () => {
  const want = /** @type {Type} */ ({ opt: SHAPE });
  // n is A's: a string there is a mismatch at the field, not a struct that fits no member
  const bad = errors('(xs, k) => ({ op: "a", at: [0, 0], n: "x" })', want);
  assert.equal(bad.length, 1);
  assert.match(bad[0], /^L003 .*field 'n' needs f64/);
  assert.deepEqual(errors('(xs, k) => (k > 0 ? { op: "a", at: [0, 0], n: k } : { op: "b", at: [k, 0] })', want), []);
});

test("an item that fits no member is still refused, and so is a list past the expected max", () => {
  const want = /** @type {Type} */ ({ list: SHAPE, max: 4 });
  assert.match(errors('(xs, k) => [{ op: "a", at: [0, 0], n: 1 }, { op: "c", at: [0, 0] }]', want).join("\n"), /L003/);
  assert.match(errors('(xs, k) => [...xs, ...xs]', want).join("\n"), /L003/);
  // without an expected list, items of two struct types stay refused, as before
  assert.match(errors('(xs, k) => { const v = [{ op: "a", at: [0, 0], n: 1 }, { op: "b", at: [0, 0] }]; return 1; }', "f64").join("\n"), /L003 An array's items share one type/);
});
