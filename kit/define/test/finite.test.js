// A record holds finite numbers only (Ben, 2026-11-25; trial 4's hidden rejects r22d `maxRate: Infinity` and r22e
// `value: NaN`): data("number"), and a number anywhere inside a shape, refuses Infinity, -Infinity and NaN as
// B004, with or without bounds.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defineDialect, defineGrammar, exact, name, data, oneOf, listOf, recordOf } from "../index.js";

const dialect = () => defineDialect({
  name: "tiny", numberType: "f64", text: () => "", spaces: { s: { pure: true } }, targets: { js: { accepts: "*", compare: exact() } },
  slots: { k: { params: [], returns: "f64", space: "s" } },
});

const grammar = () => defineGrammar(dialect(), { root: "sys", constructs: {
  sys: { opens: [name()], slots: {
    tagged: { kind: "decl", args: [data("number")] },
    bounded: { kind: "decl", args: [data("number", { whole: true })] },
    list: { kind: "decl", args: [data("number[]")] },
    opts: { kind: "decl", args: [data({ rate: "number", "cap?": data("number") })] },
    either: { kind: "decl", args: [data(oneOf("string", "number"))] },
    many: { kind: "decl", args: [data(listOf("number"))] },
    named: { kind: "decl", args: [data(recordOf("number"))] },
  } },
} });

/** @param {any[]} ds */
const codes = (ds) => ds.map((d) => d.code);

test("finite numbers build in every shape, as before", () => {
  const b = grammar()("s").tagged(-2.5).bounded(3).list([1, 2]).opts({ rate: 1e308, cap: 0 }).either(4).either("x").many([5]).named({ a: 6 });
  assert.deepEqual(codes(b.check()), []);
});

for (const v of [Infinity, -Infinity, NaN]) {
  test(`${v} is B004 wherever a number stands`, () => {
    const ds = grammar()("s").tagged(v).bounded(v).list([1, v]).opts({ rate: v }).opts({ rate: 1, cap: v }).either(v).many([v]).named({ a: v }).check();
    assert.deepEqual(codes(ds), Array(8).fill("B004"), ds.map((/** @type {any} */ d) => d.message).join("\n"));
    for (const d of ds) assert.match(d.message, /finite/, d.message);
  });
}
