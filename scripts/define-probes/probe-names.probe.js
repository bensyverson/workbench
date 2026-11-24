// Probes: a Grammar whose slot or construct takes a name the builder treats as a runtime probe.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defineDialect, defineGrammar, exact, name, data, DefinitionError, BuildError } from "../../kit/define/index.js";

const d = defineDialect({ name: "tiny", numberType: "f64", spaces: { s: { pure: true } }, targets: { js: { accepts: "*", compare: exact() } }, slots: { k: { params: [], returns: "f64", space: "s" } } });

for (const slot of ["inspect", "toString", "valueOf", "then", "constructor", "prototype", "nodeType"]) {
  test(`slot named '${slot}': refused by defineGrammar, or callable`, () => {
    let g;
    try { g = defineGrammar(d, { root: "p", constructs: { p: { opens: [name()], slots: { [slot]: { kind: "decl", args: [data("number")] } } } } }); } catch (e) {
      assert.ok(e instanceof DefinitionError); return;
    }
    let rec;
    try { rec = /** @type {any} */ (g("x"))[slot](1).build(); } catch (e) {
      assert.fail(`passed validation, then the call threw ${e?.constructor?.name}: ${e?.message}`);
    }
    assert.deepEqual(rec[slot], [1]);
  });
}
