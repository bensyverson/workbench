// @ts-nocheck: builder chains are generated, which TypeScript cannot see.
// A build-time read's `by` names the call it landed before with the tag the record's Ref ids use (leaf ugepWX): the
// second unnamed instance of one construct is `<name>~2`, so a read before its call says `e~2.size#0`, not the
// first instance's `e.size#0`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defineDialect, defineGrammar, exact, name, data, lambda, run } from "../index.js";

const d = defineDialect({
  name: "tiny", numberType: "f64", text: () => "", spaces: { s: { pure: true } }, targets: { js: { accepts: "*", compare: exact() } },
  params: { object: "P", name: "$" }, objects: { P: { label: "p", members: {} } }, globals: { $: "P" },
  slots: { f: () => ({ params: [], returns: "infer", space: "s" }) },
});
const g = defineGrammar(d, { root: "p", params: { slot: "param" }, constructs: {
  p: { opens: [name()], slots: { param: { kind: "decl", args: [name("param"), data({ value: "number" })], as: "params" } } },
  e: { parent: "p", opens: [], record: "calls", slots: { size: { kind: "decl", args: [data("number")] }, force: { kind: "decl", args: [lambda("f")] } } },
} });

test("a read before the second unnamed e's size call names e~2.size#0", () => {
  const fn = ($) => g("x").param("k", { value: 3 }).e().size(1).e().force("() => 1").size($.k);
  const r = run(fn);
  assert.deepEqual(r.record.reads.map((x) => x.by), ["e~2.size#0"]);
});

test("the first of two unnamed instances keeps the plain name, and a named instance its own", () => {
  const fn = ($) => g("x").param("k", { value: 3 }).e().size($.k).e().size(1);
  assert.deepEqual(run(fn).record.reads.map((x) => x.by), ["e.size#0"]);
});
