// Probe: a lambda() in a construct's opening arguments (README "Not built": recorded, never lowered).
import { test } from "node:test";
import assert from "node:assert/strict";
import { defineDialect, defineGrammar, exact, name, lambda, DefinitionError } from "../../kit/define/index.js";

const d = defineDialect({ name: "tiny", numberType: "f64", spaces: { s: { pure: true } }, targets: { js: { accepts: "*", compare: exact() } }, slots: { k: { params: [], returns: "f64", space: "s" } } });

test("lambda() in opens: refused by defineGrammar, or lowered, or reported", () => {
  let g;
  try { g = defineGrammar(d, { root: "p", constructs: { p: { opens: [name(), lambda("k")] } } }); } catch (e) { assert.ok(e instanceof DefinitionError); return; }
  const r = g.lower(g("x", "() => 1 + true").build());
  assert.ok(r.lambdas.length === 1 || r.diagnostics.length > 0, `lowered ${r.lambdas.length}, diagnostics ${r.diagnostics.length}`);
});
