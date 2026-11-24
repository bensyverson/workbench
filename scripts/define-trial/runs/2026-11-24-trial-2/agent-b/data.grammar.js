import { defineGrammar, name, ref, data, lambda, opt, rest, oneOf, recordOf, listOf, enumOf } from "kit/define";
import { data as dialect } from "./data.dialect.js";

const ColType = enumOf(["f64", "str", "date", "bool"]);
const ParamShape = oneOf(
  { value: "number", "min?": "number", "max?": "number", "step?": "number", "options?": "number[]", "label?": "string" },
  { value: "string", "options?": "string[]", "isDate?": "boolean", "label?": "string" },
  { value: "boolean", "label?": "string" },
);
const SourceShape = { csv: "string", columns: recordOf(ColType), "header?": "boolean" };
const ChartOpts = { "type?": enumOf(["time", "ordinal", "quantitative"]), "bins?": "number", "sort?": "string", "format?": "string", "scheme?": "string" };
const MARKS = ["line", "bar", "histogram", "heatmap"];

const colsOf = (s) => s.columns;
const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => k in obj).map((k) => [k, obj[k]]));
const flat = (args) => args.flat(Infinity);

// Starting columns of a table or chart: a source's declared columns, or another table's state.
const initFrom = (opened, { program, stateOf }) => {
  const src = program.source?.[opened.from];
  const columns = src ? { ...src.columns } : { ...stateOf(opened.from).columns };
  const lookup = (n) => program.source?.[n]?.columns ?? stateOf(n).columns;
  return { columns, keys: [], lookup };
};

const SQL_LIKE = /\bselect\b[\s\S]*\bfrom\b/i;

function tableStep(state, call, inferred) {
  const a = call.args;
  switch (call.slot) {
    case "rename": {
      const columns = {};
      for (const [k, t] of Object.entries(state.columns)) columns[a[0][k] ?? k] = t;
      return { ...state, columns };
    }
    case "cast": return { ...state, columns: { ...state.columns, ...a[0] } };
    case "derive": return { ...state, columns: { ...state.columns, [a[0]]: inferred } };
    case "groupBy": return { ...state, keys: flat(a) };
    case "agg": return { ...state, columns: { ...pick(state.columns, state.keys), ...inferred }, keys: [] };
    case "select": return { ...state, columns: pick(state.columns, flat(a)) };
    case "join": {
      const other = state.lookup(a[0]);
      const take = a[1].take ?? Object.keys(other);
      return { ...state, columns: { ...state.columns, ...pick(other, take) } };
    }
    default: return state;
  }
}

const columnNames = { column: (state) => Object.keys(colsOf(state)) };

const rejectedCommon = {
  sql: { message: "SQL text is not an input language", tip: "build the query with table methods: .join, .groupBy, .agg, .sort, .limit" },
  fragment: { message: "fragments are not part of this language", tip: "write the steps out with the core table methods" },
  component: { message: "custom components are not part of this language", tip: "write the expansion out by hand with table methods" },
  cohort: { message: "cohort is a custom component, which this language has no way to define", tip: "write the steps out with table methods" },
  agent: { message: "agent permissions are not part of a Program here", tip: "drop the agent hook" },
  layout: { message: "layout is not part of this language", tip: "list what to show with .view(...)" },
};

export const program = defineGrammar(dialect, {
  root: "program",
  constructs: {
    program: {
      opens: [name()],
      rejected: {
        ...rejectedCommon,
        charts: { message: "a chart per column needs a build-time lambda over the schema", tip: "declare each chart with .chart(name, table, mark)" },
      },
      slots: {
        source: { kind: "decl", args: [name("node"), data(SourceShape)] },
        param: { kind: "decl", args: [name("param"), data(ParamShape)], as: "params" },
        fn: { kind: "unit", unit: "fn" },
        const: { kind: "unit", unit: "const" },
        view: { kind: "decl", args: [rest(ref("node"))], once: true },
      },
    },
    table: {
      parent: "program",
      opens: [name("node"), ref("node", { as: "from" })],
      record: "calls",
      rejected: {
        pivot: { message: "pivot columns come from the data's values, which needs a build-time lambda", tip: "name the columns by hand with .derive and .agg" },
        describe: { message: "describe is a build-time profile", tip: "aggregate with .groupBy and .agg" },
      },
      check(record, ctx) {
        if (typeof record.from === "string" && SQL_LIKE.test(record.from))
          ctx.error("W001", `table "${record.node}" got a string that reads as SQL`, { arg: 1, tip: "build the query with table methods: .join, .groupBy, .agg, .sort, .limit" });
      },
      state: { init: initFrom, step: tableStep, names: columnNames },
      slots: {
        rename: { kind: "decl", args: [data(recordOf("string"))] },
        cast: { kind: "decl", args: [data(recordOf(ColType))] },
        trim: { kind: "decl", args: [rest(ref("column"))] },
        replace: { kind: "decl", args: [ref("column"), data(recordOf("string"))] },
        dropNulls: { kind: "decl", args: [data(listOf(ref("column")))] },
        dedupe: { kind: "decl", args: [data(listOf(ref("column")))] },
        select: { kind: "decl", args: [rest(ref("column"))] },
        derive: { kind: "decl", args: [data("string"), lambda("derive")] },
        filter: { kind: "decl", args: [lambda("pred")] },
        groupBy: { kind: "decl", args: [rest(ref("column"))] },
        agg: { kind: "decl", args: [data(recordOf(lambda("group")))] },
        keepGroups: { kind: "decl", args: [ref("column"), lambda("groupPred")] },
        sort: { kind: "decl", args: [rest(ref("column"))] },
        sortDesc: { kind: "decl", args: [rest(ref("column"))] },
        limit: { kind: "decl", args: [data(oneOf("number", lambda("scalar")))] },
        join: { kind: "decl", args: [ref("node"), data({ on: recordOf("string"), "take?": listOf("string") })] },
        semiJoin: { kind: "decl", args: [ref("node"), data({ on: "string" })] },
      },
    },
    chart: {
      parent: "program",
      opens: [name("node"), ref("node", { as: "from" }), data(enumOf(MARKS), { as: "mark" })],
      record: "calls",
      state: { init: initFrom, step: (s) => s, names: columnNames },
      slots: {
        x: { kind: "decl", args: [ref("column"), opt(data(ChartOpts))] },
        y: { kind: "decl", args: [ref("column"), opt(data(ChartOpts))] },
        yBy: { kind: "decl", args: [lambda("scalar")] },
        color: { kind: "decl", args: [ref("column"), opt(data(ChartOpts))] },
        tooltip: { kind: "decl", args: [rest(ref("column"))] },
        title: { kind: "decl", args: [data("string")], once: true },
        formatBy: { kind: "decl", args: [lambda("scalar")], once: true },
        rule: { kind: "decl", args: [data("number"), opt(data({ "label?": "string" }))] },
      },
    },
  },
});
