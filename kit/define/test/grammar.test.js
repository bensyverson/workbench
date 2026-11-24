// defineGrammar on a small table Grammar: the record, children and forwarded parent methods, the argument
// specs, rejected names, check(), and the D codes a bad Grammar is refused with.
import { test } from "node:test";
import assert from "node:assert/strict";
import { program, table } from "../fixtures/table-dialect.js";
import { defineGrammar, BuildError, DefinitionError, name, ref, data, lambda, opt } from "../index.js";

const pipeline = () => program("p")
  .source("sales", { price: "f64", qty: "f64", region: "str" })
  .param("minQty", 2)
  .table("monthly", "sales")
  .derive("revenue", "(row) => row.price * row.qty")
  .filter("(row) => row.qty > $.minQty")
  .groupBy("region")
  .agg({ total: "(g) => g.sum(\"revenue\")", n: "(g) => g.count()" })
  .limit(10)
  .table("big", "monthly")
  .filter("(r) => r.total > 100")
  .limit("() => $.minQty");

test("the record: openings by key, named decls as objects, calls in order, children as lists", () => {
  assert.deepEqual(pipeline().build(), {
    name: "p",
    sources: { sales: { price: "f64", qty: "f64", region: "str" } },
    params: { minQty: 2 },
    units: [],
    table: [
      { name: "monthly", from: "sales", calls: [
        { slot: "derive", args: ["revenue", "(row) => row.price * row.qty"] },
        { slot: "filter", args: ["(row) => row.qty > $.minQty"] },
        { slot: "groupBy", args: ["region"] },
        { slot: "agg", args: [{ total: "(g) => g.sum(\"revenue\")", n: "(g) => g.count()" }] },
        { slot: "limit", args: [10] },
      ] },
      { name: "big", from: "monthly", calls: [
        { slot: "filter", args: ["(r) => r.total > 100"] },
        { slot: "limit", args: ["() => $.minQty"] },
      ] },
    ],
  });
});

/** @param {() => unknown} chain */
function codes(chain) {
  try { chain(); } catch (e) { if (e instanceof BuildError) return e.diagnostics.map((d) => d.code); throw e; }
  return [];
}

test("a child's builder forwards its parent's methods, and B001 suggests among them", () => {
  const b = program("p").source("s", { x: "f64" }).table("a", "s").filter("(r) => r.x > 0");
  assert.equal(typeof /** @type {any} */ (b).param, "function");
  assert.throws(() => /** @type {any} */ (b).tabel("b", "s"), (/** @type {any} */ e) => e.code === "B001" && /Did you mean 'table'/.test(e.message));
});

test("refusals: shapes, refs, rejected names, free names, rest and oneOf", () => {
  const base = () => program("p").source("s", { x: "f64" }).table("a", "s");
  assert.deepEqual(codes(() => base().join("montly").build()), ["B003"]);
  assert.deepEqual(codes(() => base().table("b", "s").join("a").build()), []);
  assert.deepEqual(codes(() => /** @type {any} */ (base()).sql("select 1").build()), ["B009"], "a child inherits its ancestors' rejections");
  assert.deepEqual(codes(() => base().limit("ten").build()), ["B004"]);
  assert.deepEqual(codes(() => base().agg({ n: 3 }).build()), ["B007"]);
  assert.deepEqual(codes(() => base().filter("(r) => r.x > K").build()), ["B008"]);
  assert.deepEqual(codes(() => base().filter("(r) => abs(r.x) > $.k").build()), [], "intrinsics and $ are free names");
  assert.deepEqual(codes(() => program("p").source("s", { x: "int" }).build()), ["B004"]);
  assert.deepEqual(codes(() => program("p").param("k", 1).param("k", 2).build()), ["B002"]);
  const list = base().filter("(r) => r.x > K").check();
  assert.equal(list[0].code, "B008", "check() returns the list without throwing");
  assert.match(list[0].tip, /\$\.K/);
});

test("a check reports with the Dialect's own letter; a reserved letter is a bug in the definition", () => {
  const g = defineGrammar(table, { root: "p", constructs: { p: { opens: [name()], slots: {
    k: { kind: "decl", args: [data("string"), opt(data("number"))], check: (call, ctx) => { if (call.args[0] === "bad") ctx.error("T001", "no", { arg: 0, suggest: ["bat"] }); if (call.args[0] === "worse") ctx.error("B999", "no"); } },
  } } } });
  assert.deepEqual(/** @type {any} */ (g("x").k("ok").k("ok", 2)).build().k, [["ok"], ["ok", 2]]);
  const [d] = /** @type {any} */ (g("x").k("bad")).check();
  assert.equal(d.code, "T001");
  assert.match(d.message, /Did you mean 'bat'/);
  assert.throws(() => /** @type {any} */ (g("x")).k("worse"), /reserved|B, C, D/);
});

test("each bad Grammar is refused with its D code", () => {
  /** @param {Record<string, any>} constructs @param {string} [root] */
  const refused = (constructs, root = "p") => {
    try { defineGrammar(table, { root, constructs }); } catch (e) { assert.ok(e instanceof DefinitionError); return e.diagnostics.map((d) => d.code); }
    return [];
  };
  const p = { opens: [name()], slots: { k: { kind: "decl", args: [data("number")] } } };
  assert.deepEqual(refused({ p }), []);
  assert.deepEqual(refused({ p: { ...p, slots: { k: { kind: "decl", args: [lambda("pixel")] } } } }), ["D009"]);
  assert.deepEqual(refused({ p, c: { parent: "p", slots: { k: { kind: "decl", args: [data("number")] } } } }), ["D010"]);
  assert.deepEqual(refused({ p }, "q"), ["D010"]);
  assert.deepEqual(refused({ p: { ...p, slots: { c: { kind: "decl", args: [data("number")] } } }, c: { parent: "p" } }), ["D010"]);
  assert.deepEqual(refused({ p: { ...p, slots: { build: { kind: "decl", args: [data("number")] } } } }), ["D010"]);
  assert.deepEqual(refused({ p: { ...p, slots: { k: { kind: "decl", args: [data()] } } } }), ["D011"]);
  assert.deepEqual(refused({ p: { ...p, slots: { k: { kind: "lambda", args: [data("number")] } } } }), ["D014"]);
  assert.deepEqual(refused({ p: { ...p, state: { init: () => ({}), step: (/** @type {unknown} */ s) => s } } }), ["D015"]);
  assert.deepEqual(refused({ p: { ...p, slots: { k: { kind: "decl", args: [opt(data("number")), data("string")] } } } }), ["D015"]);
  assert.deepEqual(refused({ p: { ...p, record: "calls", state: { init: () => ({}), step: (/** @type {unknown} */ s) => s, names: { k: () => [] } }, slots: { k: { kind: "decl", args: [name("k")] } } } }), ["D015"]);
  assert.deepEqual(refused({ p: { ...p, slotz: {} } }), ["D001"]);
  assert.deepEqual(refused({ p: { ...p, slots: { k: { kind: "decl", args: [ref("t"), ref("t", { as: "x" })] } } } }), []);
});
