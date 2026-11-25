// Every lambda of a Program gets its own, deterministic ref id, and a stateful step sees every lambda's type.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defineDialect, defineGrammar, exact, name, data, lambda, rest, listOf, recordOf } from "../index.js";

const tiny = (/** @type {any} */ k) => defineDialect({
  name: "tiny", numberType: "f64", text: () => "", spaces: { s: { pure: true } }, targets: { js: { accepts: "*", compare: exact() } },
  slots: { k },
});
const conv = { params: [], returns: "infer", space: "s" };

const ids = (/** @type {any} */ r) => {
  const out = r.lambdas.map((/** @type {any} */ l) => l.ref.id);
  assert.equal(new Set(out).size, out.length, `ids: ${out.join(", ")}`);
  return out;
};

test("recordOf(listOf(lambda)): two lambdas under one key get distinct ids", () => {
  const g = defineGrammar(tiny(conv), { root: "p", constructs: {
    p: { opens: [name()], slots: { k: { kind: "decl", args: [data(recordOf(listOf(lambda("k"))))] } } },
  } });
  const r = g.lower(g("x").k({ a: ["() => 1", "() => 2"], b: ["() => 3"] }).build());
  assert.deepEqual(ids(r), ["x.k#0.a[0]", "x.k#0.a[1]", "x.k#0.b"]);
});

test("an object shape of two recordOf(lambda) with the same key: distinct ids", () => {
  const g = defineGrammar(tiny(conv), { root: "p", constructs: {
    p: { opens: [name()], slots: { k: { kind: "decl", args: [data({ on: recordOf(lambda("k")), off: recordOf(lambda("k")) })] } } },
  } });
  const r = g.lower(g("x").k({ on: { a: "() => 1" }, off: { a: "() => 2" } }).build());
  assert.deepEqual(ids(r), ["x.k#0.a[0]", "x.k#0.a[1]"]);
});

test("keyed '0' beside several unkeyed lambdas in one call: distinct ids", () => {
  const g = defineGrammar(tiny(conv), { root: "p", constructs: {
    p: { opens: [name()], slots: { k: { kind: "decl", args: [data(recordOf(lambda("k"))), rest(lambda("k"))] } } },
  } });
  const r = g.lower(g("x").k({ 0: "() => 1" }, "() => 2", "() => 3").build());
  assert.deepEqual(ids(r), ["x.k#0.0", "x.k#0[0]", "x.k#0[1]"]);
});

test("a lone lambda keeps the plain id; several unkeyed ones take their place in the call", () => {
  const g = defineGrammar(tiny(conv), { root: "p", constructs: {
    p: { opens: [name()], slots: { k: { kind: "decl", args: [rest(lambda("k"))] }, one: { kind: "decl", args: [lambda("k")], once: true } } },
  } });
  assert.deepEqual(ids(g.lower(g("x").k("() => 1").one("() => 2").build())), ["x.k#0", "x.one"]);
  assert.deepEqual(ids(g.lower(g("x").k("() => 1", "() => 2").build())), ["x.k#0[0]", "x.k#0[1]"]);
});

test("stateful: recordOf(listOf(lambda)) gives step every lambda's type, by key", () => {
  /** @type {unknown} */
  let seen;
  const g = defineGrammar(tiny(conv), { root: "p", constructs: {
    p: { opens: [name()] },
    t: { parent: "p", opens: [name()], record: "calls",
      state: { init: () => ({}), step: (s, _call, inferred) => { seen = inferred; return s; } },
      slots: { k: { kind: "decl", args: [data(recordOf(listOf(lambda("k"))))] } } },
  } });
  const r = g.lower(g("x").t("a").k({ a: ["() => 1", "() => true"], b: ["() => 1"] }).build());
  assert.equal(r.lambdas.length, 3, JSON.stringify(r.diagnostics));
  ids(r);
  assert.deepEqual(seen, { a: ["f64", "bool"], b: "f64" });
});

test("stateful: a call with keyed and unkeyed lambdas gives step every lambda's type, in call order", () => {
  /** @type {unknown} */
  let seen;
  const g = defineGrammar(tiny(conv), { root: "p", constructs: {
    p: { opens: [name()] },
    t: { parent: "p", opens: [name()], record: "calls",
      state: { init: () => ({}), step: (s, _call, inferred) => { seen = inferred; return s; } },
      slots: { k: { kind: "decl", args: [data(recordOf(lambda("k"))), rest(lambda("k"))] } } },
  } });
  const r = g.lower(g("x").t("a").k({ a: "() => 1" }, "() => true", "() => 1").build());
  assert.equal(r.lambdas.length, 3, JSON.stringify(r.diagnostics));
  assert.deepEqual(seen, ["f64", "bool", "f64"]);
});

test("two unnamed instances of one stateless construct: distinct ids, still named by the construct", () => {
  const g = defineGrammar(tiny(conv), { root: "p", constructs: {
    p: { opens: [name()] },
    t: { parent: "p", slots: { k: { kind: "decl", args: [lambda("k")], once: true } } },
  } });
  const b = g("x");
  b.t().k("() => 1");
  b.t().k("() => true");
  b.t().k("() => 2");
  const r = g.lower(b.build());
  assert.equal(r.lambdas.length, 3, JSON.stringify(r.diagnostics));
  assert.deepEqual(ids(r), ["t.k", "t~2.k", "t~3.k"]);
  assert.deepEqual(r.lambdas.map((l) => l.ref.on), ["t", "t", "t"]);
});

test("two instances whose name() is renamed with as: ids named by their names", () => {
  const g = defineGrammar(tiny(conv), { root: "p", constructs: {
    p: { opens: [name()] },
    t: { parent: "p", opens: [name({ as: "title" })], slots: { k: { kind: "decl", args: [lambda("k")], once: true } } },
  } });
  const b = g("x");
  b.t("one").k("() => 1");
  b.t("two").k("() => true");
  const r = g.lower(b.build());
  assert.deepEqual(ids(r), ["one.k", "two.k"]);
});

// A child's opening name is an identifier (H5, 2026-11-25), so a name spelled like a numbered id (`a~2`) is now
// refused where it used to be built and pushed the next instance to `a~3`; one name in two constructs still numbers.
test("a name spelled like another instance's id is refused; one name in two constructs gets distinct ids", () => {
  const g = defineGrammar(tiny(conv), { root: "p", constructs: {
    p: { opens: [name()] },
    t: { parent: "p", opens: [name()], slots: { k: { kind: "decl", args: [lambda("k")], once: true } } },
    u: { parent: "p", opens: [name()], slots: { k: { kind: "decl", args: [lambda("k")], once: true } } },
  } });
  assert.deepEqual(g("x").t("a~2").k("() => 1").check().map((/** @type {any} */ d) => d.code), ["B004"]);
  const b = g("x");
  b.t("a").k("() => 2");
  b.u("a").k("() => 3");
  assert.deepEqual(ids(g.lower(b.build())), ["a.k", "a~2.k"]);
});

test("stateful instances keep the B002 rule, keyed by name", () => {
  const g = defineGrammar(tiny(conv), { root: "p", constructs: {
    p: { opens: [name()] },
    t: { parent: "p", opens: [name()], record: "calls", state: { init: () => ({}), step: (s) => s }, slots: { k: { kind: "decl", args: [lambda("k")] } } },
  } });
  const b = g("x");
  b.t("a").k("() => 1");
  b.t("a").k("() => 2");
  assert.ok(b.check().some((/** @type {any} */ d) => d.code === "B002"));
});
