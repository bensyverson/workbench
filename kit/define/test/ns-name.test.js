// A construct opened with a namespaced name() (`opens: [name("table")]`) records the name under `table`,
// and the builder and lowering still name the instance by it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defineDialect, defineGrammar, exact, name, lambda } from "../index.js";

const d = defineDialect({ name: "tiny", numberType: "f64", text: () => "", spaces: { s: { pure: true } }, targets: { js: { accepts: "*", compare: exact() } }, slots: { k: { params: [], returns: "infer", space: "s" } } });

const stateful = () => defineGrammar(d, { root: "p", constructs: {
  p: { opens: [name()] },
  table: { parent: "p", opens: [name("table")], record: "calls", state: { init: () => ({}), step: (s) => s }, slots: { k: { kind: "decl", args: [lambda("k")] } } },
} });

test("stateful: two tables with distinct namespaced names are not B002", () => {
  const g = stateful();
  const b = g("x");
  b.table("sales").k("() => 1");
  b.table("costs").k("() => 2");
  assert.deepEqual(b.check().map((/** @type {any} */ x) => `${x.code} ${x.message}`), []);
  const r = g.lower(b.build());
  assert.deepEqual(r.lambdas.map((l) => [l.ref.on, l.ref.id]), [["sales", "sales.k#0"], ["costs", "costs.k#0"]]);
  assert.deepEqual(Object.keys(r.states), ["sales", "costs"]);
});

test("stateful: a taken namespaced name is still B002, naming it", () => {
  const b = stateful()("x");
  b.table("sales");
  b.table("sales");
  const ds = b.check();
  assert.ok(ds.some((/** @type {any} */ x) => x.code === "B002" && /'sales'/.test(x.message)), JSON.stringify(ds.map((/** @type {any} */ x) => x.code)));
});

test("stateless: two tables with distinct namespaced names get ids named by their names", () => {
  const g = defineGrammar(d, { root: "p", constructs: {
    p: { opens: [name()] },
    table: { parent: "p", opens: [name("table")], slots: { k: { kind: "decl", args: [lambda("k")], once: true } } },
  } });
  const b = g("x");
  b.table("sales").k("() => 1");
  b.table("costs").k("() => 2");
  const r = g.lower(b.build());
  assert.deepEqual(r.lambdas.map((l) => l.ref.id), ["sales.k", "costs.k"]);
  assert.deepEqual(r.lambdas.map((l) => l.ref.on), ["sales", "costs"]);
});
