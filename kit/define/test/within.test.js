// name(ns, { within }): a name unique only within the nearest enclosing instance of a construct (leaf 3mNV24,
// the API pilot's per-instance namespace), and one duplicate instance name as one diagnostic (leaf AitCG4).
import { test } from "node:test";
import assert from "node:assert/strict";
import { defineDialect, defineGrammar, DefinitionError, exact, name, ref, data, lambda, rest } from "../index.js";

const dialect = () => defineDialect({
  name: "tiny", numberType: "f64", text: () => "", spaces: { s: { pure: true } }, targets: { js: { accepts: "*", compare: exact() } },
  slots: { k: { params: [], returns: "f64", space: "s" } },
});

/** A budget of accounts, each with flows unique within it; a rule inside an account names one of its flows. @param {import("../define.js").NameTag} [flow] */
const grammar = (flow = name("flow", { within: "account" })) => defineGrammar(dialect(), { root: "budget", constructs: {
  budget: { opens: [name()], slots: { pick: { kind: "decl", args: [data("number")] } } },
  account: { parent: "budget", opens: [name()], slots: {
    inflow: { kind: "decl", args: [flow, lambda("k")] },
    use: { kind: "decl", args: [rest(ref("flow"))] },
  } },
  rule: { parent: "account", opens: [ref("flow", { as: "on" })] },
} });

/** @param {any[]} ds */
const codes = (ds) => ds.map((d) => d.code);

test("within: one flow name in two accounts is not B002, and each account's record keeps its own", () => {
  const b = grammar()("b").account("a").inflow("interest", () => 1).account("c").inflow("interest", () => 2);
  assert.deepEqual(codes(b.check()), []);
  const r = b.build();
  assert.deepEqual(r.account.map((/** @type {any} */ a) => Object.keys(a.inflow)), [["interest"], ["interest"]]);
});

test("within: a flow name twice in one account is one B002, naming the account", () => {
  const ds = grammar()("b").account("a").inflow("food", () => 1).inflow("food", () => 2).account("c").inflow("food", () => 3).check();
  assert.deepEqual(codes(ds), ["B002"]);
  assert.match(ds[0].message, /'food' is already declared as a flow in account 'a'/);
});

test("within: a ref inside the account resolves within it, with a did-you-mean from its own flows only", () => {
  const ok = grammar()("b").account("a").inflow("salary", () => 1).use("salary").check();
  assert.deepEqual(codes(ok), []);
  const ds = grammar()("b").account("a").inflow("salary", () => 1).account("c").inflow("bonus", () => 1).use("salry").check();
  assert.deepEqual(codes(ds), ["B003"]);
  assert.match(ds[0].message, /there is no flow 'salry' in account 'c'/);
  assert.doesNotMatch(ds[0].message, /salary/);
  assert.equal(ds[0].tip, "name one of: bonus");
  const near = grammar()("b").account("a").inflow("salary", () => 1).account("c").inflow("salery", () => 1).use("salary").check();
  assert.match(near[0].message, /Did you mean 'salery'\?/);
});

test("within: a ref declared later in the same account resolves, as a Program-wide ref does", () => {
  assert.deepEqual(codes(grammar()("b").account("a").use("late").inflow("late", () => 1).check()), []);
});

test("within: a ref in a child construct resolves in its nearest enclosing account", () => {
  const g = grammar();
  assert.deepEqual(codes(g("b").account("a").inflow("rent", () => 1).rule("rent").check()), []);
  const ds = g("b").account("a").inflow("rent", () => 1).account("c").inflow("tax", () => 1).rule("rent").check();
  assert.deepEqual(codes(ds), ["B003"]);
  assert.match(ds[0].message, /no flow 'rent' in account 'c'/);
});

test("without within, a namespace still spans the whole Program", () => {
  const ds = grammar(name("flow"))("b").account("a").inflow("interest", () => 1).account("c").inflow("interest", () => 2).check();
  assert.deepEqual(codes(ds), ["B002"]);
  assert.match(ds[0].message, /'interest' is already declared as a flow$/);
});

/** @param {Record<string, any>} constructs @returns {Array<{ code: string, message: string }>} */
const refused = (constructs) => {
  try { defineGrammar(dialect(), { root: "budget", constructs }); } catch (e) { assert.ok(e instanceof DefinitionError); return e.diagnostics; }
  return [];
};
const budget = { opens: [name()] };

test("a bad within is D011: a construct that does not exist (with a did-you-mean), not a string, or not an enclosing one", () => {
  const none = refused({ budget, account: { parent: "budget", opens: [name()], slots: { f: { kind: "decl", args: [name("flow", { within: "acount" })] } } } });
  assert.deepEqual(codes(none), ["D011"]);
  assert.match(none[0].message, /within 'acount' names no construct.*Did you mean 'account'\?/);
  assert.deepEqual(codes(refused({ budget, account: { parent: "budget", slots: { f: { kind: "decl", args: [name("flow", { within: 3 })] } } } })), ["D011"]);
  const sibling = refused({ budget, account: { parent: "budget", slots: { f: { kind: "decl", args: [name("flow", { within: "goal" })] } } }, goal: { parent: "budget" } });
  assert.deepEqual(codes(sibling), ["D011"]);
  assert.match(sibling[0].message, /'goal' is not 'account' or one of its ancestors/);
  // the construct itself and an ancestor are both fine
  assert.deepEqual(codes(refused({ budget, account: { parent: "budget", slots: { f: { kind: "decl", args: [name("flow", { within: "budget" })] } } } })), []);
});

test("a ref into a scoped namespace from outside every instance of its within construct is D011", () => {
  const ds = refused({ budget: { ...budget, slots: { top: { kind: "decl", args: [ref("flow")] } } }, account: { parent: "budget", slots: { f: { kind: "decl", args: [name("flow", { within: "account" })] } } } });
  assert.deepEqual(codes(ds), ["D011"]);
  assert.match(ds[0].message, /ref\("flow"\).*outside every account/);
  // inside a shape too
  const deep = refused({ budget: { ...budget, slots: { top: { kind: "decl", args: [data({ to: ref("flow") })] } } }, account: { parent: "budget", slots: { f: { kind: "decl", args: [name("flow", { within: "account" })] } } } });
  assert.deepEqual(codes(deep), ["D011"]);
});

test("one namespace declared with two scopes is D011", () => {
  const ds = refused({ budget: { ...budget, slots: { g: { kind: "decl", args: [name("flow")] } } }, account: { parent: "budget", slots: { f: { kind: "decl", args: [name("flow", { within: "account" })] } } } });
  assert.deepEqual(codes(ds), ["D011"]);
  assert.match(ds[0].message, /namespace 'flow'/);
});

test("name() takes { within, as } and nothing else", () => {
  assert.deepEqual(codes(refused({ budget, account: { parent: "budget", slots: { f: { kind: "decl", args: [name("flow", { within: "account", as: "x" })], as: "flows" } } } })), []);
  assert.deepEqual(codes(refused({ budget, account: { parent: "budget", slots: { f: { kind: "decl", args: [name("flow", { scope: "account" })] } } } })), ["D011"]);
});

// AitCG4: a duplicate stateful instance is one mistake, so one diagnostic, and "an" before a vowel.
const stateful = () => defineGrammar(dialect(), { root: "budget", constructs: {
  budget: { opens: [name()] },
  account: { parent: "budget", opens: [name()], record: "calls", state: { init: () => ({}), step: (/** @type {unknown} */ s) => s }, slots: { inflow: { kind: "decl", args: [data("string"), lambda("k")] } } },
} });

test("two .account(\"a\") calls are one B002, which says 'an account'", () => {
  const ds = stateful()("b").account("a").account("a").check();
  assert.deepEqual(codes(ds), ["B002"]);
  assert.match(ds[0].message, /'a' is already declared as an account/);
});

test("a stateful instance whose name clashes only in the state namespace is still B002 once", () => {
  const g = defineGrammar(dialect(), { root: "budget", constructs: {
    budget: { opens: [name()] },
    account: { parent: "budget", opens: [name()], record: "calls", state: { init: () => ({}), step: (/** @type {unknown} */ s) => s } },
    goal: { parent: "budget", opens: [name()], record: "calls", state: { init: () => ({}), step: (/** @type {unknown} */ s) => s } },
  } });
  const ds = g("b").account("a").goal("a").check();
  assert.deepEqual(codes(ds), ["B002"]);
  assert.match(ds[0].message, /stateOf/);
});
