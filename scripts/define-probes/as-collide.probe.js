// Probes: a slot's `as` key colliding with another record key; refused by defineGrammar, or nothing lost.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defineDialect, defineGrammar, exact, name, data, lambda, DefinitionError } from "../../kit/define/index.js";

const d = defineDialect({ name: "tiny", numberType: "f64", spaces: { s: { pure: true } }, targets: { js: { accepts: "*", compare: exact() } }, slots: { k: { params: [], returns: "f64", space: "s" } } });

/** @param {any} def @param {(g: any) => any} build @param {number} want */
function check(def, build, want) {
  let g;
  try { g = defineGrammar(d, def); } catch (e) { assert.ok(e instanceof DefinitionError); return "refused"; }
  const b = build(g);
  const ds = b.check();
  if (ds.length) return `B: ${ds.map((x) => x.code)}`;
  const rec = b.build();
  const r = g.lower(rec);
  assert.equal(r.lambdas.length, want, `record ${JSON.stringify(rec)}: lowered ${r.lambdas.length} of ${want}, diags ${JSON.stringify(r.diagnostics.map((x) => x.code))}`);
  return "ok";
}

test("slot as: a child construct's name", () => {
  check({ root: "p", constructs: { p: { opens: [name()], slots: { k: { kind: "decl", args: [lambda("k")], as: "t" } } }, t: { parent: "p", opens: [name()], slots: { j: { kind: "decl", args: [lambda("k")] } } } } },
    (g) => g("x").k("() => 1").t("y").j("() => 2"), 2);
});

test("slot as: the opening's key", () => {
  check({ root: "p", constructs: { p: { opens: [name()], slots: { k: { kind: "decl", args: [lambda("k")], as: "name" } } } } },
    (g) => g("x").k("() => 1"), 1);
});

test("two slots with the same as", () => {
  check({ root: "p", constructs: { p: { opens: [name()], slots: { a: { kind: "decl", args: [lambda("k")], as: "z", once: true }, b: { kind: "decl", args: [lambda("k")], as: "z", once: true } } } } },
    (g) => g("x").a("() => 1").b("() => 2"), 2);
});

test("decl slot as: units, beside a unit slot", () => {
  check({ root: "p", constructs: { p: { opens: [name()], slots: { k: { kind: "decl", args: [lambda("k")], as: "units" }, fn: { kind: "unit", unit: "fn" } } } } },
    (g) => g("x").k("() => 1").fn("h", "(x) => x"), 1);
});

test("two once slots with the same as: both lambdas' sources survive", () => {
  const g = defineGrammar(d, { root: "p", constructs: { p: { opens: [name()], slots: { a: { kind: "decl", args: [lambda("k")], as: "z", once: true }, b: { kind: "decl", args: [lambda("k")], as: "z", once: true } } } } });
  const r = g.lower(g("x").a("() => 1").b("() => 2").build());
  assert.deepEqual(r.lambdas.map((l) => l.src).sort(), ["() => 1", "() => 2"]);
});

test("slot as: name keeps the opening name", () => {
  const g = defineGrammar(d, { root: "p", constructs: { p: { opens: [name()], slots: { k: { kind: "decl", args: [lambda("k")], as: "name" } } } } });
  assert.equal(g("x").k("() => 1").build().name, "x");
});
