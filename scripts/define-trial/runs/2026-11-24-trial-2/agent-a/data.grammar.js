import { defineGrammar, name, ref, data, lambda, opt, rest, oneOf, recordOf, listOf, enumOf } from "kit/define";
import { data as dialect } from "./data.dialect.js";

const ColumnType = enumOf(["f64", "str", "bool", "date"]);

const SourceShape = { csv: "string", columns: recordOf(ColumnType), "header?": "boolean" };

const ParamShape = oneOf(
  { value: "number", "min?": "number", "max?": "number", "step?": "number", "options?": "number[]", "label?": "string" },
  { value: "string", "options?": "string[]", "kind?": enumOf(["date"]), "label?": "string" },
  { value: "boolean", "label?": "string" },
);

const pick = (o, keys) => Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, o[k]]));
const names = (args) => args.flat();

const tableState = {
  init(opened, { program, stateOf }) {
    const lookup = (n) => {
      const src = program.source?.[n];
      return src ? { columns: { ...src.columns } } : stateOf(n);
    };
    return { columns: { ...lookup(opened.from).columns }, keys: [], lookup };
  },
  step(state, call, inferred) {
    const a = call.args;
    switch (call.slot) {
      case "derive": return { ...state, columns: { ...state.columns, [a[0]]: inferred } };
      case "rename": {
        const columns = {};
        for (const [c, t] of Object.entries(state.columns)) columns[a[0][c] ?? c] = t;
        return { ...state, columns };
      }
      case "cast": return { ...state, columns: { ...state.columns, ...a[0] } };
      case "select": return { ...state, columns: pick(state.columns, names(a)) };
      case "groupBy": return { ...state, keys: names(a) };
      case "agg": return { ...state, keys: [], columns: { ...pick(state.columns, state.keys), ...inferred } };
      case "join": {
        const other = state.lookup(a[0])?.columns ?? {};
        const take = a[1].take ?? Object.keys(other).filter((c) => !(c in state.columns));
        return { ...state, columns: { ...state.columns, ...pick(other, take) } };
      }
      default: return state;
    }
  },
  names: { column: (state) => Object.keys(state.columns) },
};

const col = () => ref("column");

export const program = defineGrammar(dialect, {
  root: "program",
  constructs: {
    program: {
      opens: [name()],
      rejected: {
        sql: { message: "SQL text is not an input language", tip: "build the query with table methods: .join, .groupBy, .agg, .sort, .limit" },
        charts: { message: "build-time lambdas that return grammar are not part of this language", tip: "declare each chart with .chart(name, table)" },
        component: { message: "new components are not part of this language", tip: "compose .table and .chart steps" },
        fragment: { message: "fragments are not part of this language", tip: "write the steps out with .derive" },
        agent: { message: "agent permissions are not part of this language", tip: "drop the .agent call" },
        view: { message: "layout and views are not part of this language", tip: "drop the .view call; tables and charts are the Program" },
      },
      slots: {
        source: { kind: "decl", args: [name("table"), data(SourceShape)] },
        param: { kind: "decl", args: [name("param"), data(ParamShape)], as: "params" },
        fn: { kind: "unit", unit: "fn" },
        const: { kind: "unit", unit: "const" },
      },
    },
    table: {
      parent: "program",
      opens: [name(), ref("table", { as: "from" })],
      record: "calls",
      state: tableState,
      rejected: {
        column: { message: "column attributes are not part of this language", tip: "drop the .column call" },
      },
      slots: {
        rename: { kind: "decl", args: [data(recordOf("string"))] },
        cast: { kind: "decl", args: [data(recordOf(ColumnType))] },
        trim: { kind: "decl", args: [rest(col())] },
        replace: { kind: "decl", args: [col(), data(recordOf("string"))] },
        dropNulls: { kind: "decl", args: [rest(col())] },
        dedupe: { kind: "decl", args: [rest(col())] },
        select: { kind: "decl", args: [rest(col())] },
        derive: { kind: "decl", args: [data("string"), lambda("row")] },
        filter: { kind: "decl", args: [lambda("pred")] },
        groupBy: { kind: "decl", args: [rest(col())] },
        agg: { kind: "decl", args: [data(recordOf(lambda("group")))] },
        keepGroups: { kind: "decl", args: [col(), lambda("groupPred")] },
        join: { kind: "decl", args: [ref("table"), data({ on: recordOf("string"), "take?": listOf("string") })] },
        semiJoin: { kind: "decl", args: [ref("table"), data({ on: recordOf("string") })] },
        sort: { kind: "decl", args: [rest(col())] },
        sortDesc: { kind: "decl", args: [rest(col())] },
        limit: { kind: "decl", args: [data(oneOf("number", lambda("calc")))] },
        head: { kind: "decl", args: [data("number")] },
      },
    },
    chart: {
      parent: "program",
      opens: [name(), ref("table")],
      slots: {
        mark: { kind: "decl", args: [data(enumOf(["line", "bar", "histogram", "heatmap"]))], once: true, required: true },
        x: { kind: "decl", args: [data(oneOf("string", lambda("calc"))), opt(data({ "type?": enumOf(["time", "ordinal"]), "bins?": "number", "format?": oneOf("string", lambda("calc")) }))], once: true },
        y: { kind: "decl", args: [data(oneOf("string", lambda("calc"))), opt(data({ "type?": enumOf(["time", "ordinal"]), "sort?": "string", "format?": oneOf("string", lambda("calc")) }))], once: true },
        color: { kind: "decl", args: [data("string"), opt(data({ "scheme?": "string", "format?": "string" }))], once: true },
        tooltip: { kind: "decl", args: [rest(data("string"))], once: true },
        rule: { kind: "decl", args: [data("number"), opt(data({ "label?": "string" }))] },
      },
    },
  },
});
