// A test-only table Dialect: a source with declared columns, a table construct whose steps (derive, filter,
// groupBy, agg) thread its columns as construct state, a row space and a group space with keyed sum and
// count. No test lives here; table.test.js and grammar.test.js import it.

import { defineDialect, defineGrammar, exact, object, name, ref, data, lambda, rest, oneOf, recordOf, enumOf } from "../index.js";

/** @typedef {{ columns: Record<string, unknown>, keys?: string[] }} TableState */

export const table = defineDialect({
  name: "table",
  numberType: "f64", text: () => "",
  spaces: { row: { pure: true }, group: { pure: true } },
  objects: { Params: { label: "the params ($)", members: {} } },
  globals: { $: "Params" },
  intrinsics: { abs: { params: ["f64"], returns: "f64", ref: Math.abs, spell: { js: "Math.abs($0)" } } },
  targets: { js: { accepts: "*", compare: exact() } },
  slots: {
    row: (ref, _program, state) => ({ params: [object(`a row of ${ref.on}`, /** @type {TableState} */ (state).columns)], returns: "infer", space: "row" }),
    group: (ref, _program, state) => {
      const { columns } = /** @type {TableState} */ (state);
      const numeric = Object.keys(columns).filter((c) => columns[c] === "f64");
      return {
        params: [object(`a group of ${ref.on}`, {
          sum: { keyed: { what: "column", keys: Object.fromEntries(numeric.map((c) => [c, { params: [], returns: "f64" }])) } },
          count: { fn: { params: [], returns: "f64" } },
        })],
        returns: "infer", space: "group",
      };
    },
    scalar: { params: [], returns: "f64", space: "row" },
  },
  environment(program) {
    return { objects: { Params: { members: Object.fromEntries(Object.keys(program.params ?? {}).map((n) => [n, "f64"])) } } };
  },
});

export const program = defineGrammar(table, {
  root: "program",
  constructs: {
    program: {
      opens: [name()],
      slots: {
        source: { kind: "decl", args: [name("source"), data(recordOf(enumOf(["f64", "str", "bool"])))], as: "sources" },
        param: { kind: "decl", args: [name("param"), data("number")], as: "params" },
        fn: { kind: "unit", unit: "fn" },
      },
      rejected: { sql: { message: "SQL text is not an input language", tip: "build the query with table methods: .derive, .groupBy, .agg" } },
    },
    table: {
      parent: "program",
      opens: [name(), data("string", { as: "from" })],
      record: "calls",
      state: {
        init(opened, { program: p, stateOf }) {
          const source = p.sources?.[opened.from];
          return { columns: source ? { ...source } : { .../** @type {TableState} */ (stateOf(opened.from)).columns } };
        },
        step(state, call, inferred) {
          const s = /** @type {TableState} */ (state);
          if (call.slot === "derive") return { ...s, columns: { ...s.columns, [/** @type {string} */ (call.args[0])]: inferred } };
          if (call.slot === "groupBy") return { ...s, keys: call.args };
          if (call.slot === "agg") return { columns: { ...Object.fromEntries((s.keys ?? []).map((k) => [k, s.columns[k]])), .../** @type {object} */ (inferred) } };
          return s;
        },
        names: { column: (state) => Object.keys(/** @type {TableState} */ (state).columns) },
      },
      slots: {
        derive: { kind: "decl", args: [data("string"), lambda("row")] },
        filter: { kind: "decl", args: [lambda("row")] },
        groupBy: { kind: "decl", args: [rest(ref("column"))] },
        agg: { kind: "decl", args: [data(recordOf(lambda("group")))] },
        limit: { kind: "decl", args: [data(oneOf("number", lambda("scalar")))] },
        join: { kind: "decl", args: [ref("table")] },
      },
    },
  },
});
