import { defineGrammar, name, ref, data, lambda, rest, oneOf, recordOf, enumOf } from "kit/define";
import { data as dialect } from "./data.dialect.js";

const ColumnType = enumOf(["date", "f64", "str"]);

const ParamShape = oneOf(
  { value: "number", "min?": "number", "max?": "number", "step?": "number", "options?": "number[]" },
  { value: "string", "options?": "string[]" },
  { value: "boolean" },
  { date: "number" },
);

const tableRejected = {
  join: {
    message: "join is not in this language yet: a table's steps cannot read another table's columns",
    tip: "denormalize the columns into one source for now",
  },
  semiJoin: {
    message: "semiJoin is not in this language yet: a table's steps cannot read another table's columns",
    tip: "denormalize the columns into one source for now",
  },
};

export const program = defineGrammar(dialect, {
  root: "program",
  constructs: {
    program: {
      opens: [name()],
      rejected: {
        view: { message: "views render; rendering is outside this language", tip: "print the table from the host instead" },
        chart: { message: "charts render; rendering is outside this language", tip: "print the table from the host instead" },
        charts: { message: "charts render, and build-time lambdas are not in this language", tip: "write one table per question" },
      },
      slots: {
        param: { kind: "decl", args: [name("param"), data(ParamShape)], as: "params" },
      },
    },
    source: {
      parent: "program",
      opens: [name("table"), data(recordOf(ColumnType), { as: "columns" })],
      record: "calls",
      state: {
        init(opened) {
          return { columns: { ...opened.columns }, keys: [] };
        },
        step(state) {
          return state;
        },
      },
      slots: {},
    },
    table: {
      parent: "program",
      opens: [name("table"), ref("table", { as: "from" })],
      record: "calls",
      rejected: tableRejected,
      state: {
        init(opened, { stateOf }) {
          return { columns: { ...stateOf(opened.from).columns }, keys: [] };
        },
        step(state, call, inferred) {
          const cols = state.columns;
          const a = call.args;
          switch (call.slot) {
            case "rename": {
              const out = {};
              for (const [k, t] of Object.entries(cols)) out[k === a[0] ? a[1] : k] = t;
              return { ...state, columns: out };
            }
            case "cast":
              return { ...state, columns: { ...cols, [a[0]]: a[1] } };
            case "derive":
              return { ...state, columns: { ...cols, [a[0]]: inferred } };
            case "groupBy":
              return { ...state, keys: a };
            case "agg": {
              const kept = Object.fromEntries(state.keys.map((k) => [k, cols[k]]));
              return { columns: { ...kept, ...inferred }, keys: [] };
            }
            default:
              return state;
          }
        },
        names: {
          column: (state) => Object.keys(state.columns),
          text: (state) => Object.keys(state.columns).filter((c) => state.columns[c] === "str"),
        },
      },
      slots: {
        rename: { kind: "decl", args: [ref("column"), data("string")] },
        cast: { kind: "decl", args: [ref("column"), data(ColumnType)] },
        trim: { kind: "decl", args: [ref("text")] },
        replace: { kind: "decl", args: [ref("text"), data(recordOf("string"))] },
        dedupe: { kind: "decl", args: [rest(ref("column"))] },
        derive: { kind: "decl", args: [data("string"), lambda("derive")] },
        filter: { kind: "decl", args: [lambda("where")] },
        groupBy: { kind: "decl", args: [rest(ref("column"))] },
        agg: { kind: "decl", args: [data(recordOf(lambda("group")))] },
        sort: { kind: "decl", args: [rest(ref("column"))] },
        sortDesc: { kind: "decl", args: [rest(ref("column"))] },
        limit: { kind: "decl", args: [data(oneOf("number", lambda("value")))] },
      },
    },
  },
});
