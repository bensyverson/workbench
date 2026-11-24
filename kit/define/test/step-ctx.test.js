// step(state, call, inferred, ctx): ctx = { program, stateOf, error } (leaf YiR5Mk, trial 2's change 1). The motivating
// case is a table whose join step reads the other table's final state through stateOf, with no closure in the state.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defineDialect, defineGrammar, exact, object, name, ref, data, lambda, recordOf, enumOf } from "../index.js";

/** @typedef {{ columns: Record<string, unknown> }} S */

const dialect = defineDialect({
  name: "tbl", numberType: "f64", text: () => "", spaces: { row: { pure: true } }, targets: { js: { accepts: "*", compare: exact() } },
  slots: { row: (ref, _p, state) => ({ params: [object(`a row of ${ref.on}`, /** @type {S} */ (state).columns)], returns: "infer", space: "row" }) },
});

/** @type {any[]} */
let seen = [];

const grammar = defineGrammar(dialect, {
  root: "program",
  constructs: {
    program: { opens: [name()], slots: { source: { kind: "decl", args: [name("source"), data(recordOf(enumOf(["f64", "str"])))], as: "sources" } } },
    table: {
      parent: "program",
      opens: [name(), data("string", { as: "from" })],
      record: "calls",
      state: {
        init(opened, { program, stateOf }) {
          const source = program.sources?.[opened.from];
          return { columns: source ? { ...source } : { .../** @type {S} */ (stateOf(opened.from)).columns } };
        },
        step(state, call, inferred, ctx) {
          const s = /** @type {S} */ (state);
          seen.push(ctx);
          if (call.slot === "derive") return { columns: { ...s.columns, [call.args[0]]: inferred } };
          if (call.slot === "join") {
            const other = /** @type {S} */ (ctx.stateOf(call.args[0]));
            if (s.columns.id !== other.columns.id) ctx.error("T001", `cannot join '${call.args[0]}': its id is ${String(other.columns.id)}, here it is ${String(s.columns.id)}`, "join tables whose id columns have one type");
            return { columns: { ...other.columns, ...s.columns } };
          }
          if (call.slot === "flag") ctx.error(call.args[0], "flagged");
          return s;
        },
        names: { column: (state) => Object.keys(/** @type {S} */ (state).columns) },
      },
      slots: {
        derive: { kind: "decl", args: [data("string"), lambda("row")] },
        join: { kind: "decl", args: [ref("table")] },
        flag: { kind: "decl", args: [data("string")] },
      },
    },
  },
});

const base = () => /** @type {any} */ (grammar("p")).source("orders", { id: "f64", qty: "f64" }).source("people", { id: "f64", name: "str" }).source("tags", { id: "str", tag: "str" });

test("step receives the program, a stateOf and an error", () => {
  seen = [];
  const record = base().table("o", "orders").derive("d", "(r) => r.qty").build();
  grammar.lower(record);
  assert.equal(seen.length, 1);
  assert.deepEqual(Object.keys(seen[0]).sort(), ["error", "program", "stateOf"]);
  assert.deepEqual(seen[0].program, record);
  assert.equal(typeof seen[0].stateOf, "function");
  assert.equal(typeof seen[0].error, "function");
});

test("a join is typed through stateOf in step, and a later lambda reads a joined column", () => {
  const r = grammar.lower(base().table("p", "people").table("o", "orders").join("p").derive("who", "(r) => r.name").derive("n", "(r) => r.qty").build());
  assert.deepEqual(r.diagnostics, []);
  assert.deepEqual(r.states.o, { columns: { id: "f64", name: "str", qty: "f64", who: "str", n: "f64" } });
  assert.equal(r.lambdas.length, 2);
});

test("a joined table built later in the record is still found (lazy final state)", () => {
  const r = grammar.lower(base().table("o", "orders").join("p").derive("who", "(r) => r.name").table("p", "people").build());
  assert.deepEqual(r.diagnostics, []);
  assert.equal(/** @type {S} */ (r.states.o).columns.who, "str");
});

test("a joined column that is not there is still refused by lowering", () => {
  const r = grammar.lower(base().table("o", "orders").derive("who", "(r) => r.name").build());
  assert.deepEqual(r.diagnostics.map((d) => d.code), ["L002"]);
});

test("ctx.error in a step is a Dialect-coded diagnostic pinned at the call, with the instance and slot", () => {
  const r = grammar.lower(base().table("t", "tags").table("o", "orders").derive("a", "(r) => r.qty").join("t").build());
  const d = /** @type {any} */ (r.diagnostics.find((x) => x.code === "T001"));
  assert.deepEqual(r.diagnostics.map((x) => x.code), ["T001"]);
  assert.match(d.message, /cannot join 't': its id is str, here it is f64/);
  assert.equal(d.tip, "join tables whose id columns have one type");
  assert.equal(d.severity, "error");
  assert.match(d.file, /step-ctx\.test\.js$/);
  assert.ok(d.loc.start.line > 0);
  assert.equal(d.on, "o");
  assert.equal(d.slot, "join");
  const other = grammar.lower(base().table("p", "people").table("o", "orders").join("p").build());
  assert.deepEqual(other.diagnostics, [], "a matching join is not refused");
});

test("the state step returns after an error still applies, so later calls still type", () => {
  const r = grammar.lower(base().table("t", "tags").table("o", "orders").join("t").derive("x", "(r) => r.tag").build());
  assert.deepEqual(r.diagnostics.map((d) => d.code), ["T001"], "no L002 for the joined column");
  assert.equal(/** @type {S} */ (r.states.o).columns.x, "str");
});

test("ctx.error with a reserved letter or a malformed code throws, as a check's does", () => {
  for (const code of ["B999", "D001", "L001", "T1", "t001"]) {
    assert.throws(() => grammar.lower(base().table("o", "orders").flag(code).build()), /must be the Dialect's own letter|reserved|B, C, D/, code);
  }
  assert.deepEqual(grammar.lower(base().table("o", "orders").flag("T002").build()).diagnostics.map((d) => d.code), ["T002"]);
});

test("a stateOf loop that goes through step is B010, attributed as for init's", () => {
  const r = grammar.lower(base().table("a", "orders").join("b").table("b", "people").join("a").table("c", "orders").join("a").build());
  const b010 = r.diagnostics.filter((d) => d.code === "B010").map((d) => d.message);
  assert.equal(b010.length, 3);
  assert.match(b010[0], /table 'a' depends on its own state through stateOf: a → b → a/);
  assert.match(b010[1], /table 'b' depends on its own state through stateOf: b → a → b/);
  assert.match(b010[2], /table 'c' reads, through stateOf, a state that depends on itself: a → b → a/);
});

test("stateOf of an unknown name in step is undefined, as in init", () => {
  /** @type {unknown[]} */
  const got = [];
  const g = defineGrammar(dialect, { root: "p", constructs: {
    p: { opens: [name()] },
    t: { parent: "p", opens: [name()], record: "calls", state: { init: () => ({ columns: {} }), step: (s, _c, _i, ctx) => { got.push(ctx.stateOf("nope")); return s; } }, slots: { k: { kind: "decl", args: [data("string")] } } },
  } });
  g.lower(/** @type {any} */ (g("x")).t("one").k("v").build());
  assert.deepEqual(got, [undefined]);
});
