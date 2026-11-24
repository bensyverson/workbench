// D018: a slot or construct named like a property runtimes probe on every object can never be called.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defineDialect, defineGrammar, exact, name, data, DefinitionError } from "../index.js";
import { PROBES } from "../validate-grammar.js";

const d = defineDialect({ name: "tiny", numberType: "f64", spaces: { s: { pure: true } }, targets: { js: { accepts: "*", compare: exact() } }, slots: { k: { params: [], returns: "f64", space: "s" } } });

/** @param {any} def */
function codes(def) {
  try { defineGrammar(d, def); } catch (e) { assert.ok(e instanceof DefinitionError); return e.diagnostics.map((x) => x.code); }
  return [];
}

test("the reserved names are the ones the builder answers with undefined", () => {
  assert.deepEqual([...PROBES].sort(), ["$$typeof", "asymmetricMatch", "constructor", "inspect", "nodeType", "prototype", "then", "toJSON", "toString", "valueOf"]);
});

for (const probe of PROBES) {
  test(`a slot or a construct named '${probe}' is refused`, () => {
    assert.deepEqual(codes({ root: "p", constructs: { p: { opens: [name()], slots: { [probe]: { kind: "decl", args: [data("number")] } } } } }), ["D018"]);
    assert.deepEqual(codes({ root: "p", constructs: { p: { opens: [name()] }, [probe]: { parent: "p", opens: [name()] } } }), ["D018"]);
  });
}

test("an ordinary name is still a callable slot", () => {
  const g = defineGrammar(d, { root: "p", constructs: { p: { opens: [name()], slots: { thenAgain: { kind: "decl", args: [data("number")] } } } } });
  assert.deepEqual(g("x").thenAgain(1).build().thenAgain, [1]);
});
