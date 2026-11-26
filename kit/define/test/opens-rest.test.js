// D019: a rest() in a construct's opening arguments is refused. The record keeps one value per opening key,
// so a rest tail there kept only its first value and the opening's refs checked only that one (leaf ufTowc).
// No Dialect needs a variable-length opening; a decl slot's rest() still records every value.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defineDialect, defineGrammar, exact, name, data, ref, rest, lambda, DefinitionError } from "../index.js";

const d = defineDialect({ name: "tiny", numberType: "f64", text: () => "", spaces: { s: { pure: true } }, targets: { js: { accepts: "*", compare: exact() } }, slots: { k: { params: [], returns: "f64", space: "s" } } });

/** @param {any} constructs */
function refused(constructs) {
  try { defineGrammar(d, { root: "p", constructs }); } catch (e) { assert.ok(e instanceof DefinitionError); return e.diagnostics; }
  return [];
}

test("rest() of a ref or of data in opens is D019, naming the argument and the slot fix", () => {
  const ds = refused({ p: { opens: [name()] }, chart: { parent: "p", opens: [name(), ref("p"), rest(ref("column"))], names: { column: () => ["a"] } } });
  assert.deepEqual(ds.map((x) => x.code), ["D019"]);
  assert.deepEqual(ds[0].path, ["constructs", "chart", "opens", 2]);
  assert.match(ds[0].message, /construct 'chart', opens, argument 3: rest\(\) in an opening/);
  assert.match(ds[0].tip ?? "", /decl slot/);
  assert.deepEqual(refused({ p: { opens: [name(), rest(data("string"))] } }).map((x) => x.code), ["D019"]);
});

test("rest(lambda()) in opens is still one D019, not two", () => {
  assert.deepEqual(refused({ p: { opens: [name(), rest(lambda("k"))] } }).map((x) => x.code), ["D019"]);
});

test("a decl slot's rest() still records every value", () => {
  const g = defineGrammar(d, { root: "p", constructs: { p: { opens: [name()], slots: { tags: { kind: "decl", args: [rest(data("string"))] } } } } });
  assert.deepEqual(g("x").tags("a", "b").build().tags, [["a", "b"]]);
});
