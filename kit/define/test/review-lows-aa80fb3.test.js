// The seven lows of the aa80fb3 review (leaf cKtlR4): within on an opening name, bounds, required's message, an().
import { test } from "node:test";
import assert from "node:assert/strict";
import { defineDialect, defineGrammar, DefinitionError, exact, name, data, lambda } from "../index.js";
import { an } from "../codes.js";

const dialect = () => defineDialect({
  name: "tiny", numberType: "f64", text: () => "", spaces: { s: { pure: true } }, targets: { js: { accepts: "*", compare: exact() } },
  slots: { k: { params: [], returns: "f64", space: "s" } },
});

/** @param {Record<string, any>} constructs @param {string} [root] */
const define = (constructs, root = "budget") => defineGrammar(dialect(), { root, constructs });
/** @param {() => unknown} f */
const refused = (f) => { try { f(); } catch (e) { if (e instanceof DefinitionError) return e.diagnostics; throw e; } return []; };
/** @param {unknown} spec */
const withSlot = (spec) => define({ budget: { opens: [name()], slots: { s: { kind: "decl", args: [spec] } } } });

test("an opening name scoped within its own construct is D011", () => {
  const ds = refused(() => define({ budget: { opens: [name()] }, account: { parent: "budget", opens: [name("account", { within: "account" })] } }));
  assert.deepEqual(ds.map((d) => d.code), ["D011"]);
  assert.match(ds[0].message, /own/);
});

test("within on an opening name of a child, scoped to its parent or an ancestor, and on a slot's own construct still work", () => {
  assert.deepEqual(refused(() => define({ budget: { opens: [name()] }, account: { parent: "budget", opens: [name()] }, rule: { parent: "account", opens: [name("rule", { within: "account" })] } })), []);
  assert.deepEqual(refused(() => define({ budget: { opens: [name()] }, account: { parent: "budget", opens: [name()], slots: { f: { kind: "decl", args: [name("flow", { within: "account" })] } } } })), []);
});

test("a bounded number is finite: B004 for Infinity under a min and -Infinity under a max", () => {
  const g = define({ budget: { opens: [name()], slots: {
    pos: { kind: "decl", args: [data("number", { min: 0 })] },
    cap: { kind: "decl", args: [data("number", { max: 10 })] },
    free: { kind: "decl", args: [data("number")] },
  } } });
  assert.deepEqual(g("b").pos(Infinity).check().map((/** @type {any} */ d) => d.code), ["B004"]);
  assert.deepEqual(g("b").cap(-Infinity).check().map((/** @type {any} */ d) => d.code), ["B004"]);
  assert.match(g("b").pos(Infinity).check()[0].message, /finite/);
  assert.deepEqual(g("b").pos(5).cap(10).check(), []);
  assert.deepEqual(g("b").pos(0).cap(-3).check(), []);
});

test("a bounded whole number with no integer in its range is D011; a range that holds one is clean", () => {
  const ds = refused(() => withSlot(data("number", { min: 0.5, max: 0.6, whole: true })));
  assert.deepEqual(ds.map((d) => d.code), ["D011"]);
  assert.match(ds[0].message, /no whole number/);
  assert.deepEqual(refused(() => withSlot(data("number", { min: 0.5, max: 1.5, whole: true }))), []);
  assert.deepEqual(refused(() => withSlot(data("number", { min: 3, max: 3, whole: true }))), []);
  assert.deepEqual(refused(() => withSlot(data("number", { min: 0.5, max: 0.6 }))), []);
  assert.deepEqual(refused(() => withSlot(data("number", { min: 0.5, whole: true }))), []);
});

test("required: false on the root says what is wrong, not that it is required", () => {
  const ds = refused(() => define({ budget: { required: false } }));
  assert.deepEqual(ds.map((d) => d.code), ["D011"]);
  assert.doesNotMatch(ds[0].message, /is required but/);
  assert.match(ds[0].message, /root/);
  const t = refused(() => define({ budget: { required: true } }));
  assert.match(t[0].message, /root/);
});

test("an() picks the article by sound for common words", () => {
  for (const w of ["user", "unit", "one", "use", "usage", "uniform", "union", "European"]) assert.equal(an(w), `a ${w}`);
  for (const w of ["account", "envelope", "item", "order", "hour", "honest", "umbrella", "unknown"]) assert.equal(an(w), `an ${w}`);
});

test("a scoped opening name in two instances gets distinct lambda ids through lower", () => {
  const g = define({
    budget: { opens: [name()] },
    account: { parent: "budget", opens: [name()] },
    rule: { parent: "account", opens: [name("rule", { within: "account" })], slots: { k: { kind: "decl", args: [lambda("k")], once: true } } },
  });
  const low = g.lower(g("b").account("a").rule("r").k(() => 1).account("c").rule("r").k(() => 2).build());
  assert.deepEqual(low.diagnostics, []);
  const ids = low.lambdas.map((/** @type {any} */ l) => l.ref.id);
  assert.equal(new Set(ids).size, 2);
});
