// Lowering a record: no lambda dropped, mis-identified or given the wrong inferred type.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defineDialect, defineGrammar, exact, name, data, lambda, opt, rest, listOf } from "../index.js";

const tiny = (/** @type {any} */ k) => defineDialect({
  name: "tiny", numberType: "f64", text: () => "", spaces: { s: { pure: true } }, targets: { js: { accepts: "*", compare: exact() } },
  slots: { k },
});

test("stateful construct: a B011 on call #0 must not drop an accepted call #1 of the same slot", () => {
  const d = tiny((/** @type {any} */ ref) => (ref.index === 0 ? "not first" : { params: [], returns: "f64", space: "s" }));
  const g = defineGrammar(d, { root: "p", constructs: {
    p: { opens: [name()] },
    t: { parent: "p", opens: [name()], record: "calls",
      state: { init: () => ({}), step: (s) => s },
      slots: { k: { kind: "decl", args: [lambda("k")] } } },
  } });
  const r = g.lower(g("x").t("a").k("() => 1").k("() => 2").build());
  assert.deepEqual(r.diagnostics.map((x) => x.code), ["B011"]);
  // the non-stateful twin (lower.test.js) keeps a.k#1; the stateful one should too
  assert.deepEqual(r.lambdas.map((l) => l.ref.id), ["a.k#1"]);
});

test("an absent opt() before another opt(): the lambda after it must still be lowered", () => {
  const d = tiny({ params: [], returns: "f64", space: "s" });
  const g = defineGrammar(d, { root: "p", constructs: {
    p: { opens: [name()], slots: { k: { kind: "decl", args: [opt(data("number")), opt(lambda("k"))] } } },
  } });
  const b = g("x").k(undefined, "() => 1");
  assert.deepEqual(b.check(), []);
  const rec = b.build();
  const r = g.lower(rec);
  assert.equal(r.lambdas.length, 1, `record: ${JSON.stringify(rec)}; lambdas: ${r.lambdas.length}; diags: ${JSON.stringify(r.diagnostics.map((x) => x.code))}`);
});

test("same with rest(lambda)", () => {
  const d = tiny({ params: [], returns: "f64", space: "s" });
  const g = defineGrammar(d, { root: "p", constructs: {
    p: { opens: [name()], slots: { k: { kind: "decl", args: [opt(data("number")), rest(lambda("k"))] } } },
  } });
  const rec = g("x").k(undefined, "() => 1", "() => 2").build();
  const r = g.lower(rec);
  assert.equal(r.lambdas.length, 2, `record: ${JSON.stringify(rec)}; lambdas: ${r.lambdas.length}`);
});

test("several lambdas in one call without recordOf keys get distinct ids", () => {
  const d = tiny({ params: [], returns: "f64", space: "s" });
  const g = defineGrammar(d, { root: "p", constructs: {
    p: { opens: [name()], slots: { k: { kind: "decl", args: [data(listOf(lambda("k")))] } } },
  } });
  const r = g.lower(g("x").k(["() => 1", "() => 2"]).build());
  const ids = r.lambdas.map((l) => l.ref.id);
  assert.equal(new Set(ids).size, ids.length, `ids: ${ids.join(", ")}`);
});

test("a lambda in rest() spreads several lambdas in one call: distinct ids", () => {
  const d = tiny({ params: [], returns: "f64", space: "s" });
  const g = defineGrammar(d, { root: "p", constructs: {
    p: { opens: [name()], slots: { k: { kind: "decl", args: [rest(lambda("k"))] } } },
  } });
  const r = g.lower(g("x").k("() => 1", "() => 2").build());
  const ids = r.lambdas.map((l) => l.ref.id);
  assert.equal(new Set(ids).size, ids.length, `ids: ${ids.join(", ")}`);
});

test("a call's several unkeyed lambdas give step their types as a list; a lone lambda gives its type", () => {
  /** @type {unknown[]} */
  const seen = [];
  const d = defineDialect({
    name: "tiny", numberType: "f64", text: () => "", spaces: { s: { pure: true } }, targets: { js: { accepts: "*", compare: exact() } },
    slots: { k: (ref) => ({ params: [], returns: ref.id.endsWith("[1]") ? "bool" : "infer", space: "s" }) },
  });
  const g = defineGrammar(d, { root: "p", constructs: {
    p: { opens: [name()] },
    t: { parent: "p", opens: [name()], record: "calls",
      state: { init: () => ({}), step: (s, call, inferred) => { seen.push([call.slot, inferred]); return s; } },
      slots: { one: { kind: "decl", args: [lambda("k")] }, many: { kind: "decl", args: [rest(lambda("k"))] } } },
  } });
  g.lower(g("x").t("a").one("() => 1").many("() => 1", "() => true").build());
  assert.deepEqual(seen, [["one", "f64"], ["many", ["f64", "bool"]]]);
});
