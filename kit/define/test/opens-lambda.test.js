// D019: a lambda in a construct's opening arguments is refused until it is built; slots' lambdas still lower.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defineDialect, defineGrammar, exact, name, data, opt, rest, oneOf, lambda, DefinitionError } from "../index.js";

const d = defineDialect({ name: "tiny", numberType: "f64", text: () => "", spaces: { s: { pure: true } }, targets: { js: { accepts: "*", compare: exact() } }, slots: { k: { params: [], returns: "f64", space: "s" } } });

/** @param {any} opens */
function codes(opens) {
  try { defineGrammar(d, { root: "p", constructs: { p: { opens } } }); } catch (e) { assert.ok(e instanceof DefinitionError); return e.diagnostics.map((x) => x.code); }
  return [];
}

test("lambda() in opens is refused, bare, optional, rest or inside a data shape", () => {
  assert.deepEqual(codes([name(), lambda("k")]), ["D019"]);
  assert.deepEqual(codes([name(), opt(lambda("k"))]), ["D019"]);
  assert.deepEqual(codes([name(), rest(lambda("k"))]), ["D019"]);
  assert.deepEqual(codes([name(), data(oneOf("number", lambda("k")))]), ["D019"]);
});

test("opens without a lambda, and a slot's lambda, are fine", () => {
  assert.deepEqual(codes([name(), data("number")]), []);
  const g = defineGrammar(d, { root: "p", constructs: { p: { opens: [name()], slots: { k: { kind: "decl", args: [lambda("k")] } } } } });
  assert.deepEqual(g.lower(g("x").k("() => 1").build()).lambdas.map((l) => l.src), ["() => 1"]);
});
