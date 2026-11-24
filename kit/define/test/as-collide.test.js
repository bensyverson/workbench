// D017: two things of a construct that the record would put under one key are refused, so no lambda is lost.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defineDialect, defineGrammar, exact, name, ref, data, lambda, DefinitionError } from "../index.js";

const d = defineDialect({ name: "tiny", numberType: "f64", spaces: { s: { pure: true } }, targets: { js: { accepts: "*", compare: exact() } }, slots: { k: { params: [], returns: "f64", space: "s" } } });
const k = (/** @type {Record<string, unknown>} */ extra = {}) => /** @type {any} */ ({ kind: "decl", args: [lambda("k")], ...extra });

/** The codes defineGrammar refuses a definition with, or [] when it accepts it. @param {any} def */
function codes(def) {
  try { defineGrammar(d, def); } catch (e) { assert.ok(e instanceof DefinitionError); return e.diagnostics.map((x) => x.code); }
  return [];
}

test("a slot's as that is a child construct's name is refused", () => {
  assert.deepEqual(codes({ root: "p", constructs: { p: { opens: [name()], slots: { k: k({ as: "t" }) } }, t: { parent: "p", opens: [name()], slots: { j: k() } } } }), ["D017"]);
});

test("a slot's as that is the opening's key is refused, and so is a slot named like it", () => {
  assert.deepEqual(codes({ root: "p", constructs: { p: { opens: [name()], slots: { k: k({ as: "name" }) } } } }), ["D017"]);
  assert.deepEqual(codes({ root: "p", constructs: { p: { opens: [name()], slots: { name: k() } } } }), ["D017"]);
});

test("an opening's own as is checked against the slots and children too", () => {
  assert.deepEqual(codes({ root: "p", constructs: { p: { opens: [name(), ref("s", { as: "k" })], slots: { k: k() } } } }), ["D017"]);
  assert.deepEqual(codes({ root: "p", constructs: { p: { opens: [name(), data("number", { as: "t" })] }, t: { parent: "p", opens: [name()] } } }), ["D017"]);
  assert.deepEqual(codes({ root: "p", constructs: { p: { opens: [name(), data("number", { as: "z" }), data("number", { as: "z" })] } } }), ["D017"]);
});

test("two slots with one as are refused", () => {
  assert.deepEqual(codes({ root: "p", constructs: { p: { opens: [name()], slots: { a: k({ as: "z", once: true }), b: k({ as: "z", once: true }) } } } }), ["D017"]);
});

test("a decl slot's as of units beside a unit slot is refused; the two unit slots share units", () => {
  assert.deepEqual(codes({ root: "p", constructs: { p: { opens: [name()], slots: { k: k({ as: "units" }), fn: { kind: "unit", unit: "fn" } } } } }), ["D017"]);
  assert.deepEqual(codes({ root: "p", constructs: { p: { opens: [name()], slots: { fn: { kind: "unit", unit: "fn" }, const: { kind: "unit", unit: "const" } } } } }), []);
});

test("a record: \"calls\" construct's key calls is taken by the calls", () => {
  assert.deepEqual(codes({ root: "p", constructs: { p: { opens: [name()] }, t: { parent: "p", record: "calls", opens: [name(), data("number", { as: "calls" })], slots: { k: k() } } } }), ["D017"]);
});

test("distinct as keys still work, and the record uses them", () => {
  const g = defineGrammar(d, { root: "p", constructs: { p: { opens: [name()], slots: { k: k({ as: "ks" }) } } } });
  const rec = g("x").k("() => 1").build();
  assert.equal(rec.name, "x");
  assert.deepEqual(rec.ks, ["() => 1"]);
  assert.deepEqual(g.lower(rec).lambdas.map((l) => l.src), ["() => 1"]);
});
