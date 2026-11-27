// valueProblem and fillDefaults: whether a value fits a parsed seam (a record's fields, defaults for what is left out),
// the one check kit/run's `in` input (N012) and kit/package's checkTests (K021) share.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSeam } from "../index.js";
import { valueProblem, fillDefaults } from "../value.js";

/** @param {string} text */
const seam = (text) => { const r = parseSeam(text); if (!r.ok) throw new Error(r.error); return r.type; };
/** An Event's record. @param {string} text */
const rec = (text) => /** @type {any} */ (seam(`Event<${text}>`)).of;

test("a record fits when every field without a default is there, each of its type, and no other", () => {
  const r = rec("{ a: f64, b: bool = true, name: str, at: point2@c, v: vec3, d: f64@c }");
  assert.equal(valueProblem(r, { a: 1, name: "x", at: [1, 2], v: [1, 2, 3], d: 4 }), null);
  assert.match(String(valueProblem(r, { name: "x", at: [1, 2], v: [1, 2, 3], d: 4 })), /'a' is missing and has no default/);
  assert.match(String(valueProblem(r, { a: 1, name: "x", at: [1, 2], v: [1, 2, 3], d: 4, z: 1 })), /'z' is not a field.*a, b, name, at, v, d/);
  assert.match(String(valueProblem(r, { a: "1", name: "x", at: [1, 2], v: [1, 2, 3], d: 4 })), /'a'.*"1".*f64/);
  assert.match(String(valueProblem(r, { a: 1, name: "x", at: [1], v: [1, 2, 3], d: 4 })), /'at'.*point2/);
  assert.match(String(valueProblem(r, { a: 1, name: 3, at: [1, 2], v: [1, 2, 3], d: 4 })), /'name'/);
  assert.match(String(valueProblem(r, { a: Infinity, name: "x", at: [1, 2], v: [1, 2, 3], d: 4 })), /'a'/);
});

test("a record is an object: not null, an array or a scalar", () => {
  const r = rec("{ a: f64 = 1 }");
  for (const v of [null, [1], 3, "x"]) assert.match(String(valueProblem(r, v)), /record/, JSON.stringify(v));
  assert.equal(valueProblem(r, {}), null);
});

test("enums, lists and nested records are judged inside", () => {
  const r = rec("{ kind: 'a' | 'b', xs: list<f64, 2>, inner: { n: f64 = 3, s: str } }");
  assert.equal(valueProblem(r, { kind: "a", xs: [1], inner: { s: "q" } }), null);
  assert.match(String(valueProblem(r, { kind: "c", xs: [1], inner: { s: "q" } })), /'kind'.*'a' \| 'b'/);
  assert.match(String(valueProblem(r, { kind: "a", xs: [1, 2, 3], inner: { s: "q" } })), /'xs'.*2/);
  assert.match(String(valueProblem(r, { kind: "a", xs: ["x"], inner: { s: "q" } })), /'xs\[0\]'/);
  assert.match(String(valueProblem(r, { kind: "a", xs: [1], inner: {} })), /'inner.s' is missing/);
});

test("fillDefaults gives each missing field its default, in a copy, and leaves what is given", () => {
  const r = rec("{ points: f64 = 1, at: vec2 = [0, 0], held: bool }");
  const given = { held: true, points: 5 };
  const out = /** @type {any} */ (fillDefaults(r, given));
  assert.deepEqual(out, { points: 5, at: [0, 0], held: true });
  assert.deepEqual(given, { held: true, points: 5 }, "the given value is not changed");
  out.at[0] = 9;
  assert.deepEqual(/** @type {any} */ (fillDefaults(r, given)).at, [0, 0], "the default itself is not shared");
  assert.equal(fillDefaults(r, null), null, "a value that is not a record is left to valueProblem");
});
