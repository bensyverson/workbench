// A oneOf whose lambda sits under a compound branch (an object or a listOf): the call and a re-match of its
// record must pick the same branch. The record holds the lambda as text, which a "string" branch also
// takes, so among the branches that fit, the one holding the most lambdas wins (review tVYfAk, finding 1).
import { test } from "node:test";
import assert from "node:assert/strict";
import { defineDialect, defineGrammar, exact, name, ref, data, lambda, oneOf, recordOf, listOf } from "../index.js";

const d = defineDialect({
  name: "t", numberType: "f64", text: () => "", spaces: { s: { pure: true } }, targets: { js: { accepts: "*", compare: exact() } },
  slots: { v: { params: [], returns: "f64", space: "s" }, w: { params: ["f64"], returns: "f64", space: "s" } },
});
/** @param {any} shape */
const grammar = (shape) => defineGrammar(d, { root: "p", constructs: { p: { opens: [name()], slots: {
  col: { kind: "decl", args: [name("column")] },
  y: { kind: "decl", args: [data(shape)] },
} } } });

/** The call's diagnostics, and what lowering its record finds. @param {any} g @param {unknown} v */
const same = (g, v) => {
  const b = g("x").col("a").y(v);
  const atCall = b.check().map((/** @type {any} */ x) => x.code);
  const r = g.lower(b.build());
  return { atCall, lowered: r.lambdas.length, diags: r.diagnostics.map((/** @type {any} */ x) => x.code) };
};

test("oneOf(object with a lambda, object with a string): a function value is lowered", () => {
  const r = same(grammar(oneOf({ f: lambda("v") }, { f: "string" })), { f: () => 1 });
  assert.deepEqual(r.atCall, []);
  assert.equal(r.lowered, 1, "the call found a lambda; lowering must too");
});

test("oneOf(listOf(lambda), string[]): a function element is lowered", () => {
  const r = same(grammar(oneOf(listOf(lambda("v")), "string[]")), [() => 1]);
  assert.deepEqual(r.atCall, []);
  assert.equal(r.lowered, 1, "the call found a lambda; lowering must too");
});

test("the branch order does not change it, and plain text still takes the string branch", () => {
  const g = grammar(oneOf({ f: "string" }, { f: lambda("v") }));
  assert.equal(same(g, { f: () => 1 }).lowered, 1);
  assert.equal(same(g, { f: "() => 1" }).lowered, 1);
  assert.equal(same(g, { f: "hello" }).lowered, 0);
  const gl = grammar(oneOf("string[]", listOf(lambda("v"))));
  assert.equal(same(gl, ["hello"]).lowered, 0);
  assert.equal(same(gl, [() => 1]).lowered, 1);
});

test("nested oneOf in recordOf in listOf still finds every lambda", () => {
  const r = same(grammar(listOf(recordOf(oneOf(ref("column"), lambda("w"))))), [{ p: "a", q: (/** @type {number} */ z) => z + 1 }, { r: "(z) => z * 2", s: "a" }]);
  assert.deepEqual(r.atCall, []);
  assert.equal(r.lowered, 2);
  assert.deepEqual(r.diags, []);
});
