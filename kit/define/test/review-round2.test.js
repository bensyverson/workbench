// Review of 6edf1f1 and 3f262b4 (job BZFevT), findings 1 to 4, from the reviewer's probes
// local/rev-round2-probes/{dedup,consts,const-cycle,const-cycle-fields,oneof-tie}.probe.js.
// @ts-nocheck: lambdas name the Dialect's free names, which TypeScript cannot see.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defineDialect, defineGrammar, exact, name, data, lambda, recordOf, oneOf } from "../index.js";
import { field } from "../../dialects/fields/grammar.js";
import { lowerField } from "../../dialects/fields/program.js";

// 1. A call's diagnostics were de-duplicated on [code, message, tip], so two that differ only in ref or arg merged.
const picky = defineDialect({
  name: "tbl", numberType: "f64", text: () => "", spaces: { row: { pure: true } }, targets: { js: { accepts: "*", compare: exact() } },
  slots: { picky: () => "this convention refuses every lambda", row: { params: ["f64"], returns: "f64", space: "row" } },
});
const tables = defineGrammar(picky, {
  root: "program",
  constructs: {
    program: { opens: [name()], slots: {} },
    table: {
      parent: "program", opens: [name()], record: "calls",
      state: {
        init: () => ({}),
        step: (s, call, _inferred, ctx) => {
          if (call.slot === "pair") for (const i of [0, 1]) ctx.error("T001", "this argument is refused", { arg: i, tip: "drop it" });
          return s;
        },
      },
      slots: {
        two: { kind: "decl", args: [lambda("picky"), lambda("picky")] },
        many: { kind: "decl", args: [data(recordOf(lambda("picky")))] },
        pair: { kind: "decl", args: [data("number"), data("number")] },
      },
    },
  },
});

test("two refused lambdas of one call are two B011s, one per ref", () => {
  for (const b of [tables("p").table("t").two(() => 1, () => 2), tables("p").table("t").many({ a: () => 1, b: () => 2 })]) {
    const b011 = tables.lower(b.build()).diagnostics.filter((d) => d.code === "B011");
    assert.equal(b011.length, 2);
    assert.notEqual(b011[0].ref.id, b011[1].ref.id);
  }
});

test("two step errors of one call that differ only in arg are both reported", () => {
  const ds = tables.lower(tables("p").table("t").pair(1, 2).build()).diagnostics.filter((d) => d.code === "T001");
  assert.deepEqual(ds.map((d) => d.arg), [0, 1]);
});

// 2 and 3. Constants against helpers.
const tiny = defineDialect({
  name: "tiny", numberType: "f32", text: () => "", constants: { calls: "pure" },
  spaces: { row: { pure: true } }, targets: { js: { accepts: "*", compare: exact() } },
  slots: { keep: { params: ["f32"], returns: "f32", space: "row" } },
});
const g = defineGrammar(tiny, {
  root: "c",
  constructs: { c: { opens: [name()], slots: { fn: { kind: "unit", unit: "fn" }, const: { kind: "unit", unit: "const" }, keep: { kind: "decl", args: [lambda("keep")], once: true } } } },
});
const codes = (b) => g.lower(b.build()).diagnostics.map((d) => d.code);

test("a constant reading a later constant is refused alike, whether or not a helper forces a second inference pass", () => {
  assert.ok(codes(g("c").const("A", "B + 1").const("B", "2").keep("(x) => x + A")).includes("L014"));
  assert.ok(codes(g("c").fn("h", "(a) => a * 2").const("A", "B + 1").const("B", "2").keep("(x) => h(x) + A")).includes("L014"));
  // what must still work: a constant reading an earlier one, with and without a helper
  assert.deepEqual(codes(g("c").fn("h", "(a) => a * 2").const("B", "2").const("A", "B + 1").keep("(x) => h(x) + A")), []);
});

test("a helper that reads the constant calling it recurses through it: L007", () => {
  assert.ok(codes(g("c").fn("g", "() => K").const("K", "g()").keep("(x) => x + K")).includes("L007"));
  const r = lowerField(field("c").fn("g", "() => K * 0.5").const("K", "g()").pixel("(uv, u) => color(K, uv.x, 0)").build());
  const all = [...r.diagnostics, ...r.helpers.flatMap((h) => h.result.diagnostics)];
  assert.ok(all.some((d) => d.code === "L007"), JSON.stringify(all.map((d) => d.code)));
  // what must still work: a constant calling a helper that reads another constant
  assert.deepEqual(codes(g("c").const("J", "2").fn("g", "() => J").const("K", "g()").keep("(x) => x + K")), []);
});

// 4. A oneOf whose forms tie on lambdas at different places, once the lambdas are text.
const v = defineDialect({
  name: "t", numberType: "f64", text: () => "", spaces: { s: { pure: true } }, targets: { js: { accepts: "*", compare: exact() } },
  slots: { v: { params: [], returns: "f64", space: "s" } },
});
const ty = defineGrammar(v, { root: "p", constructs: { p: { opens: [name()], slots: {
  y: { kind: "decl", args: [data(oneOf({ f: lambda("v"), g: "string" }, { f: "string", g: lambda("v") }))] },
} } } });

test("a value whose record would fit two forms with lambdas in different places is refused at the call (B004)", () => {
  const ds = ty("x").y({ f: "() => 1", g: () => "oops" }).check();
  assert.deepEqual(ds.map((d) => d.code), ["B004"]);
  assert.match(ds[0].message, /forms/);
  // what must still work: a value only one form fits, as text too
  assert.deepEqual(ty("x").y({ f: () => 1, g: "plain" }).check(), []);
});

// 7. The B007 warning on text that looks like a lambda but does not parse ended its message in ".;".
test("the B007 warning's message reads as one sentence", () => {
  const tz = defineGrammar(v, { root: "p", constructs: { p: { opens: [name()], slots: { z: { kind: "decl", args: [data(oneOf("string", lambda("v")))] } } } } });
  const w = tz("x").z("() => 1 +").check().filter((d) => d.code === "B007");
  assert.equal(w.length, 1);
  assert.doesNotMatch(w[0].message, /\.;/);
});
