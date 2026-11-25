// @ts-nocheck: the UI's lambdas are source text, never called, and name the Dialect's free names.
// Review lows on defineUI and the state's D023 (leaf dPyoXH): a hostile value is a DefinitionError, not a crash;
// void and null are not state types; a destructured parameter and a typo'd key whose target is present get a message
// that says what to do.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defineDialect, defineGrammar, defineUI, exact, struct, list, opt, name, DefinitionError } from "../index.js";

const base = (state) => ({
  name: "orbits", numberType: "f64", spaces: { s: { pure: true } }, targets: { js: { accepts: "*", compare: exact() } },
  slots: { v: { params: [], returns: "f64", space: "s" } }, state, text: () => "",
});
const dialect = defineDialect(base({ t: "f64", bodies: list(struct({ speed: "f64" }), 5) }));
const orbits = defineGrammar(dialect, { root: "p", constructs: { p: { opens: [name()], slots: {} } } });

/** @param {unknown} decl */
function refused(decl) {
  try { defineUI(orbits, decl); return []; } catch (e) {
    assert.ok(e instanceof DefinitionError, `a DefinitionError, not ${e}`);
    return e.diagnostics;
  }
}
const tile = (...body) => ({ tiles: { t: { title: "T", place: { splitBelow: "stage" }, body } } });
const stateCodes = (state) => { try { defineDialect(base(state)); return []; } catch (e) { assert.ok(e instanceof DefinitionError, String(e)); return e.diagnostics.map((d) => d.code); } };

test("a BigInt or a cyclic value in a declaration is refused with U012, not a TypeError", () => {
  const cyc = {}; cyc.self = cyc;
  for (const label of [1n, cyc]) {
    const ds = refused(tile({ kind: "stat", label, value: "t" }));
    assert.deepEqual(ds.map((d) => d.code), ["U012"]);
  }
  const ds = refused(tile({ kind: "stat", label: "x", value: "t", max: 1n }));
  assert.deepEqual(ds.map((d) => d.code), ["U012"]);
  assert.match(ds[0].message, /1/);
});

test("void and null are not state member types (D023), at any depth", () => {
  assert.deepEqual(stateCodes({ p: "void" }), ["D023"]);
  assert.deepEqual(stateCodes({ p: "null" }), ["D023"]);
  assert.deepEqual(stateCodes({ p: opt("void") }), ["D023"]);
  assert.deepEqual(stateCodes({ p: list("null", 3) }), ["D023"]);
  assert.deepEqual(stateCodes({ p: struct({ a: "void" }) }), ["D023"]);
  assert.deepEqual(stateCodes({ p: "f64", q: opt("str") }), [], "real types still pass");
});

test("a destructured parameter is U007 saying a parameter is the whole state", () => {
  for (const fn of [({ t }) => t > 0, ({ bogus }) => true, ([a]) => a]) {
    const ds = refused(tile({ kind: "check", label: "c", expect: fn }));
    assert.deepEqual(ds.map((d) => d.code), ["U007"], String(fn));
    assert.match(ds[0].message, /parameter/);
    assert.match(ds[0].message + ds[0].tip, /s\.member/);
    assert.doesNotMatch(ds[0].message, /not a name a view's lambda may read/);
  }
  assert.deepEqual(refused(tile({ kind: "check", label: "c", expect: (s) => s.t > 0 })), [], "a plain parameter still passes");
});

test("U001's did-you-mean tip says to remove the typo when the right key is present", () => {
  const ds = refused({ tiles: { a: { title: "T", titel: "x", place: { splitBelow: "stage" }, body: [{ kind: "text", value: "x" }] } } });
  assert.equal(ds.length, 1);
  assert.match(ds[0].message, /title/);
  assert.match(ds[0].tip, /remove 'titel'/);
  assert.doesNotMatch(ds[0].tip, /write title/);
  const missing = refused({ tiles: { a: { titel: "T", place: { splitBelow: "stage" }, body: [{ kind: "text", value: "x" }] } } });
  assert.match(missing[0].tip, /write title/, "when the right key is absent the tip still says to write it");
});
