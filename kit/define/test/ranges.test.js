// Bounds on a number shape, data("number", { min, max, whole }), at an argument or inside a shape (leaf S2OAyB,
// the API pilot's hand-written range checks). A value outside them is B004 naming the bound; a bad bound is D011.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defineDialect, defineGrammar, DefinitionError, exact, name, data, oneOf, listOf } from "../index.js";

const dialect = () => defineDialect({
  name: "tiny", numberType: "f64", text: () => "", spaces: { s: { pure: true } }, targets: { js: { accepts: "*", compare: exact() } },
  slots: { k: { params: [], returns: "f64", space: "s" } },
});

const grammar = () => defineGrammar(dialect(), { root: "budget", constructs: {
  budget: { opens: [name()], slots: {
    horizon: { kind: "decl", args: [data("number", { min: 1, max: 120, whole: true })], once: true },
    start: { kind: "decl", args: [data("number", { whole: true }), data("number", { min: 1, max: 12, whole: true, as: "month" })], once: true },
    rate: { kind: "decl", args: [data("number", { max: 1 })] },
    pick: { kind: "decl", args: [data(oneOf("string", data("number", { min: 0 })))] },
    many: { kind: "decl", args: [data(listOf(data("number", { whole: true })))] },
  } },
  account: { parent: "budget", opens: [name(), data({ opening: data("number", { min: 0 }), "cap?": data("number", { max: 1e6 }) }, { as: "terms" })] },
} });

/** @param {any[]} ds */
const codes = (ds) => ds.map((d) => d.code);

test("values inside the bounds build, and the record keeps them as given", () => {
  const b = grammar()("b").horizon(120).start(2026, 12).rate(0.5).pick(0).pick("x").many([1, 2]).account("a", { opening: 0 });
  assert.deepEqual(codes(b.check()), []);
  const r = b.build();
  assert.equal(r.horizon, 120);
  assert.deepEqual(r.start, [2026, 12]);
  assert.deepEqual(r.account[0].terms, { opening: 0 });
});

test("a value below min is B004 naming the min", () => {
  const ds = grammar()("b").horizon(0).check();
  assert.deepEqual(codes(ds), ["B004"]);
  assert.match(ds[0].message, /argument 1: 0 is below its min, 1/);
});

test("a value above max is B004 naming the max", () => {
  const ds = grammar()("b").horizon(121).rate(2).check();
  assert.deepEqual(codes(ds), ["B004", "B004"]);
  assert.match(ds[0].message, /121 is above its max, 120/);
  assert.match(ds[1].message, /2 is above its max, 1/);
});

test("a value that is not whole is B004 naming whole", () => {
  const ds = grammar()("b").horizon(1.5).start(2026.5, 1).many([1, 2.5]).check();
  assert.deepEqual(codes(ds), ["B004", "B004", "B004"]);
  assert.match(ds[0].message, /1\.5 is not a whole number \(whole: true\)/);
  assert.match(ds[1].message, /argument 1: 2026\.5 is not a whole number/);
  // a list's element is an item, not another argument
  assert.match(ds[2].message, /argument 1, item 2: 2\.5 is not a whole number/);
});

test("NaN is outside any bound", () => {
  assert.deepEqual(codes(grammar()("b").horizon(NaN).check()), ["B004"]);
});

test("a bound inside an object shape: the key is named, and an optional key is checked only when given", () => {
  const ds = grammar()("b").account("a", { opening: -5 }).check();
  assert.deepEqual(codes(ds), ["B004"]);
  assert.match(ds[0].message, /argument 2, key 'opening': -5 is below its min, 0/);
  assert.deepEqual(codes(grammar()("b").account("a", { opening: 1, cap: 2e6 }).check()), ["B004"]);
  assert.deepEqual(codes(grammar()("b").account("a", { opening: 1, cap: 5 }).check()), []);
});

test("a bound inside oneOf: the bounded branch refuses, so the value fits none", () => {
  assert.deepEqual(codes(grammar()("b").pick(-1).check()), ["B004"]);
});

test("the shape a bound sits on is still checked: a string is B004 as before", () => {
  const ds = grammar()("b").horizon("12").check();
  assert.deepEqual(codes(ds), ["B004"]);
  assert.match(ds[0].message, /expected a number/);
});

/** @param {unknown[]} args @returns {Array<{ code: string, message: string }>} */
const refused = (args) => {
  try { defineGrammar(dialect(), { root: "p", constructs: { p: { slots: { k: { kind: "decl", args: /** @type {any} */ (args) } } } } }); } catch (e) { assert.ok(e instanceof DefinitionError); return e.diagnostics; }
  return [];
};

test("a bad bound is D011: on a shape other than number, an unknown key, a bound that is not a finite number, min above max, whole not a boolean", () => {
  const onString = refused([data("string", { min: 1 })]);
  assert.deepEqual(codes(onString), ["D011"]);
  assert.match(onString[0].message, /only a number shape takes min, max and whole/);
  assert.deepEqual(codes(refused([data("number[]", { max: 3 })])), ["D011"]);
  assert.deepEqual(codes(refused([data("number", { step: 2 })])), ["D011"]);
  assert.deepEqual(codes(refused([data("number", { min: "0" })])), ["D011"]);
  assert.deepEqual(codes(refused([data("number", { max: Infinity })])), ["D011"]);
  const crossed = refused([data("number", { min: 5, max: 1 })]);
  assert.deepEqual(codes(crossed), ["D011"]);
  assert.match(crossed[0].message, /min 5 is above its max 1/);
  assert.deepEqual(codes(refused([data("number", { whole: "yes" })])), ["D011"]);
  // inside a shape, the same rules, and no as (a key inside a shape has no record key of its own)
  assert.deepEqual(codes(refused([data({ x: data("string", { min: 1 }) })])), ["D011"]);
  assert.deepEqual(codes(refused([data({ x: data("number", { min: 0, as: "y" }) })])), ["D011"]);
  // and what still works
  assert.deepEqual(codes(refused([data("number", { min: 0, max: 0, whole: false })])), []);
  assert.deepEqual(codes(refused([data({ value: "number" }, { as: "v" })])), []);
});
