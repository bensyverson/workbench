// A name-keyed slot entry named `__proto__` is an own key of its record, never the record's prototype: its
// lambda is lowered, not dropped.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defineDialect, defineGrammar, exact, name, lambda } from "../index.js";

const d = defineDialect({ name: "tiny", numberType: "f64", text: () => "", spaces: { s: { pure: true } }, targets: { js: { accepts: "*", compare: exact() } }, slots: { k: { params: [], returns: "infer", space: "s" } } });

test("a name-keyed lambda named __proto__ is an own key and is lowered", () => {
  const g = defineGrammar(d, { root: "p", constructs: { p: { opens: [name()], slots: { on: { kind: "decl", args: [name("ev"), lambda("k")] } } } } });
  const rec = g("x").on("__proto__", "() => 1").on("go", "() => 2").build();
  assert.deepEqual(Object.keys(rec.on), ["__proto__", "go"]);
  assert.equal(Object.getPrototypeOf(rec.on), Object.prototype);
  const r = g.lower(rec);
  assert.deepEqual(r.diagnostics, []);
  assert.deepEqual(r.lambdas.map((l) => l.src), ["() => 1", "() => 2"]);
});

test("an opening name of __proto__ is kept", () => {
  const g = defineGrammar(d, { root: "p", constructs: { p: { opens: [name()], slots: { k: { kind: "decl", args: [lambda("k")], once: true } } } } });
  const r = g.lower(g("__proto__").k("() => 1").build());
  assert.deepEqual(r.lambdas.map((l) => l.ref.id), ["__proto__.k"]);
});
