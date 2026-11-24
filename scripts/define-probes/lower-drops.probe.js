// Probes: lambdas dropped or mis-identified by kit/define/lower.js.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defineDialect, defineGrammar, exact, name, data, lambda, opt, rest, listOf } from "../../kit/define/index.js";

const tiny = (k) => defineDialect({
  name: "tiny", numberType: "f64", spaces: { s: { pure: true } }, targets: { js: { accepts: "*", compare: exact() } },
  slots: { k },
});

test("P1 stateful construct: a B011 on call #0 must not drop an accepted call #1 of the same slot", () => {
  const d = tiny((ref) => (ref.index === 0 ? "not first" : { params: [], returns: "f64", space: "s" }));
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

test("P2 an absent opt() before another opt(): the lambda after it must still be lowered", () => {
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

test("P2b same with rest(lambda)", () => {
  const d = tiny({ params: [], returns: "f64", space: "s" });
  const g = defineGrammar(d, { root: "p", constructs: {
    p: { opens: [name()], slots: { k: { kind: "decl", args: [opt(data("number")), rest(lambda("k"))] } } },
  } });
  const rec = g("x").k(undefined, "() => 1", "() => 2").build();
  const r = g.lower(rec);
  assert.equal(r.lambdas.length, 2, `record: ${JSON.stringify(rec)}; lambdas: ${r.lambdas.length}`);
});

test("P3 several lambdas in one call without recordOf keys get distinct ids", () => {
  const d = tiny({ params: [], returns: "f64", space: "s" });
  const g = defineGrammar(d, { root: "p", constructs: {
    p: { opens: [name()], slots: { k: { kind: "decl", args: [data(listOf(lambda("k")))] } } },
  } });
  const r = g.lower(g("x").k(["() => 1", "() => 2"]).build());
  const ids = r.lambdas.map((l) => l.ref.id);
  assert.equal(new Set(ids).size, ids.length, `ids: ${ids.join(", ")}`);
});

test("P3b a lambda in rest() spreads several lambdas in one call: distinct ids", () => {
  const d = tiny({ params: [], returns: "f64", space: "s" });
  const g = defineGrammar(d, { root: "p", constructs: {
    p: { opens: [name()], slots: { k: { kind: "decl", args: [rest(lambda("k"))] } } },
  } });
  const r = g.lower(g("x").k("() => 1", "() => 2").build());
  const ids = r.lambdas.map((l) => l.ref.id);
  assert.equal(new Set(ids).size, ids.length, `ids: ${ids.join(", ")}`);
});

test("P5 two stateful instances with the same name in different constructs: each gets its own state", () => {
  const d = defineDialect({
    name: "tiny", numberType: "f64", spaces: { s: { pure: true } }, targets: { js: { accepts: "*", compare: exact() } },
    slots: { k: (_ref, _p, state) => ({ params: [], returns: /** @type {any} */ (state).ret, space: "s" }) },
  });
  const mk = (ret) => ({ parent: "p", opens: [name()], record: "calls", state: { init: () => ({ ret }), step: (s) => s }, slots: {} });
  const a = { ...mk("f64"), slots: { ka: { kind: "decl", args: [lambda("k")] } } };
  const b = { ...mk("bool"), slots: { kb: { kind: "decl", args: [lambda("k")] } } };
  const g = defineGrammar(d, { root: "p", constructs: { p: { opens: [name()] }, a, b } });
  const bl = g("x").a("same").ka("() => 1").b("same").kb("() => true");
  assert.deepEqual(bl.check(), []);
  const r = g.lower(bl.build());
  assert.deepEqual(r.diagnostics.map((x) => x.code), [], JSON.stringify(r.diagnostics.map((x) => x.message)));
  assert.equal(Object.keys(r.states).length, 2, `states: ${JSON.stringify(r.states)}`);
});
