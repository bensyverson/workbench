// A child construct with required: true (leaf CmIJKc, the API pilot's "one or more accounts"): a parent instance
// with none of it is B005, with a tip naming the call to add.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defineDialect, defineGrammar, DefinitionError, exact, name, data } from "../index.js";

const dialect = () => defineDialect({
  name: "tiny", numberType: "f64", text: () => "", spaces: { s: { pure: true } }, targets: { js: { accepts: "*", compare: exact() } },
  slots: { k: { params: [], returns: "f64", space: "s" } },
});

const grammar = () => defineGrammar(dialect(), { root: "budget", constructs: {
  budget: { opens: [name()], slots: { horizon: { kind: "decl", args: [data("number")], once: true } } },
  account: { parent: "budget", opens: [name()], required: true },
  entry: { parent: "account", opens: [data("number")], required: true },
  note: { parent: "budget", opens: [data("string")] },
} });

/** @param {any[]} ds */
const codes = (ds) => ds.map((d) => d.code);

test("a budget with no account is B005, naming the call to add", () => {
  const ds = grammar()("b").horizon(12).note("hi").check();
  assert.deepEqual(codes(ds), ["B005"]);
  assert.match(ds[0].message, /budget 'b' has no account/);
  assert.equal(ds[0].tip, "add .account(…)");
});

test("each parent instance needs its own: one account with an entry and one without is one B005", () => {
  const ds = grammar()("b").account("a").entry(1).account("c").check();
  assert.deepEqual(codes(ds), ["B005"]);
  assert.match(ds[0].message, /account 'c' has no entry/);
});

test("a parent with its required children builds; a child that is not required may be absent", () => {
  const b = grammar()("b").account("a").entry(1);
  assert.deepEqual(codes(b.check()), []);
  assert.deepEqual(b.build().note, []);
});

/** @param {Record<string, any>} constructs @returns {Array<{ code: string, message: string }>} */
const refused = (constructs) => {
  try { defineGrammar(dialect(), { root: "budget", constructs }); } catch (e) { assert.ok(e instanceof DefinitionError); return e.diagnostics; }
  return [];
};

test("required on the root, or not a boolean, is D011", () => {
  const root = refused({ budget: { opens: [name()], required: true } });
  assert.deepEqual(codes(root), ["D011"]);
  assert.match(root[0].message, /root/);
  assert.deepEqual(codes(refused({ budget: { opens: [name()] }, account: { parent: "budget", required: "yes" } })), ["D011"]);
  assert.deepEqual(codes(refused({ budget: { opens: [name()] }, account: { parent: "budget", required: false } })), []);
});
