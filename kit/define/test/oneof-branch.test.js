// A oneOf that holds both a ref and a lambda: the branch matched at the call is the branch lowering uses.
// The record keeps a lambda as text, so the rule for a string is stated: one that parses as an arrow function
// is the lambda, anything else is the ref.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defineDialect, defineGrammar, exact, name, ref, data, lambda, oneOf, recordOf, listOf } from "../index.js";

const d = defineDialect({
  name: "t", numberType: "f64", spaces: { s: { pure: true } }, targets: { js: { accepts: "*", compare: exact() } },
  slots: { v: { params: [], returns: "f64", space: "s" } },
});
/** @param {any} shape */
const grammar = (shape) => defineGrammar(d, { root: "p", constructs: { p: { opens: [name()], slots: {
  col: { kind: "decl", args: [name("column")] },
  y: { kind: "decl", args: [data(shape)] },
} } } });
const mixed = () => grammar(oneOf(ref("column"), lambda("v")));

test("a real function in oneOf(ref, lambda) is lowered as a lambda", () => {
  const g = mixed();
  const b = g("x").col("a").y(() => 1);
  assert.deepEqual(b.check(), []);
  const r = g.lower(b.build());
  assert.deepEqual(r.diagnostics, []);
  assert.equal(r.lambdas.length, 1);
});

test("arrow source text in oneOf(ref, lambda) is the lambda, not a ref", () => {
  const g = mixed();
  const b = g("x").col("a").y("() => 1");
  assert.deepEqual(b.check(), []);
  const r = g.lower(b.build());
  assert.deepEqual(r.diagnostics, []);
  assert.equal(r.lambdas.length, 1);
});

test("a plain name in oneOf(ref, lambda) is the ref and lowers no lambda", () => {
  const g = mixed();
  const b = g("x").col("a").y("a");
  assert.deepEqual(b.check(), []);
  const r = g.lower(b.build());
  assert.deepEqual(r.diagnostics, []);
  assert.equal(r.lambdas.length, 0);
  assert.deepEqual(g("x").col("a").y("nope").check().map((/** @type {any} */ x) => x.code), ["B003"]);
});

test("the order of the branches does not change the rule", () => {
  const g = grammar(oneOf(lambda("v"), ref("column")));
  assert.equal(g.lower(g("x").col("a").y("() => 1").build()).lambdas.length, 1);
  assert.equal(g.lower(g("x").col("a").y(() => 1).build()).lambdas.length, 1);
  assert.deepEqual(g("x").col("a").y("a").check(), []);
});

test("oneOf('string', lambda): arrow text is the lambda, other text stays a string", () => {
  const g = grammar(oneOf("string", lambda("v")));
  assert.equal(g.lower(g("x").y("() => 1").build()).lambdas.length, 1);
  assert.equal(g.lower(g("x").y(() => 1).build()).lambdas.length, 1);
  assert.equal(g.lower(g("x").y("hello").build()).lambdas.length, 0);
});

test("the same inside listOf and recordOf", () => {
  const gl = grammar(listOf(oneOf(ref("column"), lambda("v"))));
  const rl = gl.lower(gl("x").col("a").y(["a", () => 1, "() => 2"]).build());
  assert.deepEqual(rl.diagnostics, []);
  assert.equal(rl.lambdas.length, 2);
  const gr = grammar(recordOf(oneOf(ref("column"), lambda("v"))));
  const rr = gr.lower(gr("x").col("a").y({ p: "a", q: () => 1, r: "() => 2" }).build());
  assert.deepEqual(rr.diagnostics, []);
  assert.equal(rr.lambdas.length, 2);
});
