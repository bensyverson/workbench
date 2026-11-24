// A stateOf loop through step re-runs the looping instances' calls, once per instance told about the loop.
// One mistake is still one diagnostic: a B003, a B011 or a ctx.error from a call is reported once (review
// tVYfAk, finding 2). And step's ctx.error takes the options object a check's does (nit 4).
import { test } from "node:test";
import assert from "node:assert/strict";
import { defineDialect, defineGrammar, exact, object, name, ref, data, lambda, recordOf, enumOf } from "../index.js";

const dialect = defineDialect({
  name: "tbl", numberType: "f64", text: () => "", spaces: { row: { pure: true } }, targets: { js: { accepts: "*", compare: exact() } },
  slots: {
    row: (ref, _p, state) => ({ params: [object(`a row of ${ref.on}`, /** @type {any} */ (state).columns)], returns: "infer", space: "row" }),
    picky: () => "this convention refuses every lambda",
  },
});

const grammar = defineGrammar(dialect, {
  root: "program",
  constructs: {
    program: { opens: [name()], slots: { source: { kind: "decl", args: [name("source"), data(recordOf(enumOf(["f64", "str"])))], as: "sources" } } },
    table: {
      parent: "program",
      opens: [name(), data("string", { as: "from" })],
      record: "calls",
      state: {
        init(opened, { program }) { return { columns: { ...(program.sources?.[opened.from] ?? {}) } }; },
        step(state, call, inferred, ctx) {
          const s = /** @type {any} */ (state);
          if (call.slot === "derive") return { columns: { ...s.columns, [call.args[0]]: inferred } };
          if (call.slot === "join") { const o = /** @type {any} */ (ctx.stateOf(call.args[0])); return { columns: { ...o.columns, ...s.columns } }; }
          if (call.slot === "flag") ctx.error("T001", "flagged");
          if (call.slot === "tipobj") ctx.error("T002", "with an options object", { tip: "do this", arg: 0, fix: "x()" });
          if (call.slot === "tipstr") ctx.error("T003", "with a string tip", "do that");
          return s;
        },
        names: { column: (state) => Object.keys(/** @type {any} */ (state).columns) },
      },
      slots: {
        derive: { kind: "decl", args: [data("string"), lambda("row")] },
        refuse: { kind: "decl", args: [lambda("picky")] },
        join: { kind: "decl", args: [ref("table")] },
        flag: { kind: "decl", args: [] },
        tipobj: { kind: "decl", args: [] },
        tipstr: { kind: "decl", args: [] },
        pick: { kind: "decl", args: [ref("column")] },
      },
    },
  },
});

const base = () => /** @type {any} */ (grammar("p")).source("orders", { id: "f64", qty: "f64" }).source("people", { id: "f64", name: "str" });
/** @param {any} b */
const codes = (b) => grammar.lower(b.build()).diagnostics.map((/** @type {any} */ d) => d.code);

test("a B003 before a looping join is reported once, beside one B010 per looping instance", () => {
  const got = codes(base().table("a", "orders").pick("nope").join("b").table("b", "people").join("a"));
  assert.deepEqual(got.toSorted(), ["B003", "B010", "B010"]);
});

test("a ctx.error before a looping join is reported once", () => {
  const got = codes(base().table("a", "orders").flag().join("b").table("b", "people").join("a").table("c", "orders").join("a"));
  assert.equal(got.filter((c) => c === "T001").length, 1);
  assert.equal(got.filter((c) => c === "B010").length, 3);
});

test("a B011 before a looping join is reported once", () => {
  const got = codes(base().table("a", "orders").refuse(() => 1).join("b").table("b", "people").join("a"));
  assert.equal(got.filter((c) => c === "B011").length, 1);
});

test("the same mistake on two calls is still two diagnostics", () => {
  const got = codes(base().table("a", "orders").pick("nope").pick("nope").flag().flag());
  assert.deepEqual(got, ["B003", "B003", "T001", "T001"]);
});

test("step's ctx.error takes a check's options object", () => {
  const r = grammar.lower(base().table("a", "orders").tipobj().build());
  const d = /** @type {any} */ (r.diagnostics[0]);
  assert.equal(d.code, "T002");
  assert.equal(d.tip, "do this");
  assert.equal(d.arg, 0);
  assert.equal(d.fix, "x()");
  assert.equal(d.on, "a");
});

test("step's ctx.error still takes a string tip", () => {
  const r = grammar.lower(base().table("a", "orders").tipstr().build());
  const d = /** @type {any} */ (r.diagnostics[0]);
  assert.equal(d.code, "T003");
  assert.equal(d.tip, "do that");
});
