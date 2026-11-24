// Review tVYfAk's nits 5–7: a function that is not a Runtime Lambda keeps B007's detail inside a oneOf; text
// that looks like an arrow function yet does not parse is still a string or ref, with a warning that says why;
// B008's tip for Math.X names any bare name the lambda can see, not only an intrinsic.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defineDialect, defineGrammar, exact, name, ref, data, lambda, oneOf } from "../index.js";

const d = defineDialect({
  name: "t", numberType: "f64", text: () => "", spaces: { s: { pure: true } }, targets: { js: { accepts: "*", compare: exact() } },
  globals: { PI: "f64" },
  library: { hypot: { fn: "(a, b) => a + b" } },
  slots: { v: { params: [], returns: "f64", space: "s" } },
});
/** @param {any} shape @param {boolean} [checked]  with a check that always reports T001 */
const grammar = (shape, checked = true) => defineGrammar(d, { root: "p", constructs: { p: { opens: [name()], slots: {
  col: { kind: "decl", args: [name("column")] },
  y: { kind: "decl", args: [data(shape)], ...(checked ? { check: (/** @type {any} */ _call, /** @type {any} */ ctx) => ctx.error("T001", "the check ran") } : {}) },
} } } });

test("an async function in oneOf('string', lambda) is B007 with its detail, not only B004", () => {
  const g = grammar(oneOf("string", lambda("v")));
  const ds = /** @type {any[]} */ (g("x").y(async () => 1).check());
  assert.deepEqual(ds.map((x) => x.code), ["B007"]);
  assert.match(ds[0].message, /parse|async/);
  assert.ok(ds[0].lambda?.src.includes("async"));
});

test("arrow-looking text that does not parse is still a string, with a warning naming the parse error", () => {
  const g = grammar(oneOf("string", lambda("v")));
  const ds = /** @type {any[]} */ (g("x").y("() => 1 +").check());
  const w = ds.find((x) => x.code === "B007");
  assert.equal(w?.severity, "warning");
  assert.match(w.message, /does not parse/);
  assert.match(w.tip, /arrow/);
  assert.ok(ds.some((x) => x.code === "T001"), "a warning does not stop the slot's check");
  const plain = grammar(oneOf("string", lambda("v")), false);
  assert.equal(plain.lower(plain("x").y("() => 1 +").build()).lambdas.length, 0, "not reinterpreted");
});

test("arrow-looking text in oneOf(ref, lambda) warns beside its B003", () => {
  const g = grammar(oneOf(ref("column"), lambda("v")));
  const ds = /** @type {any[]} */ (g("x").col("a").y("() => a +").check());
  assert.deepEqual(ds.map((x) => `${x.code} ${x.severity}`).toSorted(), ["B003 error", "B007 warning", "T001 error"]);
});

test("plain text and parsing arrows get no warning", () => {
  const g = grammar(oneOf("string", lambda("v")));
  assert.deepEqual(g("x").y("hello").check().map((/** @type {any} */ x) => x.code), ["T001"]);
  assert.deepEqual(g("x").y("() => 1").check().map((/** @type {any} */ x) => x.code), ["T001"]);
});

test("B008's tip for Math.X names a bare global or Library entry of that name", () => {
  const g = grammar(lambda("v"));
  const tip = (/** @type {string} */ src) => /** @type {any} */ (g("x").y(src).check().find((/** @type {any} */ x) => x.code === "B008"))?.tip;
  assert.match(tip("() => Math.PI"), /use PI, not Math\.PI/);
  assert.match(tip("() => Math.hypot(1, 2)"), /use hypot, not Math\.hypot/);
  assert.match(tip("() => Math.E"), /Math is not in the language/);
});
