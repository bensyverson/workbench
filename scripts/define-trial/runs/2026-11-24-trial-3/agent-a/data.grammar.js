import { defineGrammar, name, ref, data, lambda, opt, rest, oneOf, recordOf, listOf, enumOf } from "kit/define";
import { data as dataDialect } from "./data.dialect.js";

const COLUMN_TYPE = enumOf(["f64", "str", "date", "bool"]);

const SourceShape = { csv: "string", "header?": "boolean", columns: recordOf(COLUMN_TYPE) };

const ParamShape = oneOf(
  { widget: enumOf(["slider"]), value: "number", min: "number", max: "number", "step?": "number", "label?": "string" },
  { widget: enumOf(["select"]), value: "string", options: "string[]", "label?": "string" },
  { widget: enumOf(["select"]), value: "number", options: "number[]", "label?": "string" },
  { widget: enumOf(["select"]), value: "string", from: { table: ref("table"), column: "string" }, "label?": "string" },
  { widget: enumOf(["date"]), value: "number", "label?": "string" },
);

const EncodingShape = { "type?": enumOf(["time", "ordinal", "quantitative"]), "sort?": "string", "bins?": "number", "format?": "string", "scheme?": "string" };

// The columns of a source or a table, at that table's last step.
const columnsOf = (tableName, program, stateOf) => {
  const source = program.source?.[tableName];
  return source ? { ...source.columns } : { ...stateOf(tableName).columns };
};

const known = (ctx, columns, c, arg) => {
  if (c in columns) return true;
  ctx.error("T002", `no column '${c}' at this step.`, { tip: `columns: ${Object.keys(columns).join(", ")}`, arg, suggest: Object.keys(columns) });
  return false;
};

const tableState = {
  init(opened, { program, stateOf }) {
    return { columns: columnsOf(opened.from, program, stateOf), keys: [] };
  },
  step(state, call, inferred, ctx) {
    const cols = state.columns;
    const a = call.args;
    switch (call.slot) {
      case "derive":
        return { ...state, columns: { ...cols, [a[0]]: inferred } };
      case "rename": {
        const next = {};
        for (const [c, t] of Object.entries(cols)) next[a[0][c] ?? c] = t;
        for (const c of Object.keys(a[0])) known(ctx, cols, c, [0, c]);
        return { ...state, columns: next };
      }
      case "cast": {
        const next = { ...cols };
        for (const [c, t] of Object.entries(a[0])) if (known(ctx, cols, c, [0, c])) next[c] = t;
        return { ...state, columns: next };
      }
      case "replace":
      case "trim":
        for (const c of [a].flat()) if (typeof c === "string" && c in cols && cols[c] !== "str") ctx.error("T003", `column '${c}' is ${cols[c]}, not str`, "trim and replace work on str columns");
        return state;
      case "groupBy":
        return { ...state, keys: a.flat() };
      case "agg":
        return { columns: { ...Object.fromEntries(state.keys.map((k) => [k, cols[k]])), ...inferred }, keys: [] };
      case "select":
        return { ...state, columns: Object.fromEntries(a.flat().map((c) => [c, cols[c]])) };
      case "sort":
        for (const s of a.flat()) known(ctx, cols, s.replace(/^-/, ""), 0);
        return state;
      case "join": {
        const [other, { on, take }] = a;
        const right = columnsOf(other, ctx.program, ctx.stateOf);
        for (const [l, r] of Object.entries(on)) {
          if (!known(ctx, cols, l, [1, "on", l]) || !known(ctx, right, r, [1, "on", l])) continue;
          if (cols[l] !== right[r]) ctx.error("T001", `join key types differ: ${l} is ${cols[l]}, ${other}.${r} is ${right[r]}`, { arg: [1, "on", l], tip: "join on columns of one type" });
        }
        const keys = new Set(Object.values(on));
        const brought = take ?? Object.keys(right).filter((c) => !keys.has(c));
        const next = { ...cols };
        for (const c of brought) if (known(ctx, right, c, [1, "take"])) next[c] = right[c];
        return { ...state, columns: next };
      }
      case "semiJoin": {
        const [other, { on }] = a;
        const right = columnsOf(other, ctx.program, ctx.stateOf);
        if (known(ctx, cols, on, [1, "on"]) && known(ctx, right, on, [1, "on"]) && cols[on] !== right[on])
          ctx.error("T001", `join key types differ: ${on} is ${cols[on]} here, ${right[on]} in ${other}`, { arg: [1, "on"] });
        return state;
      }
      case "pivot": {
        const { rows, cols: pc, expect } = a[0];
        known(ctx, cols, rows, [0, "rows"]); known(ctx, cols, pc, [0, "cols"]);
        return { columns: { [rows]: cols[rows], ...Object.fromEntries(expect.map((v) => [v, inferred.values ?? inferred])) }, keys: [] };
      }
      case "describe":
        return { columns: { column: "str", count: "f64", nulls: "f64", min: "f64", max: "f64", mean: "f64" }, keys: [] };
      default:
        return state; // filter, dropNulls, dedupe, limit, keepGroups, units
    }
  },
  names: { column: (state) => Object.keys(state.columns) },
};

const encoding = { kind: "decl", args: [ref("column"), opt(data(EncodingShape))], once: true };

export const program = defineGrammar(dataDialect, {
  root: "program",
  params: { slot: "param" },
  constructs: {
    program: {
      opens: [name()],
      rejected: {
        sql: { message: "SQL text is not an input language", tip: "build the query with table methods: .join, .groupBy, .agg, .sort, .limit" },
        view: { message: "layout and rendering are not part of this language; the host shows each table and chart", tip: "name a table or chart; the host renders it" },
        fragment: { message: "fragments are not part of this language: a table's methods are fixed", tip: "write the steps out on the table" },
        component: { message: "new components are not part of this language", tip: "write the component's expansion out as tables" },
        charts: { message: "build-time fan-out is not a grammar call", tip: "loop in the Program function and call .chart once per chart" },
        agent: { message: "agent permissions are not part of this language" },
      },
      slots: {
        param: { kind: "decl", args: [name("param"), data(ParamShape)], as: "params",
          check({ args: [n, p] }, ctx) {
            if (p.widget === "slider" && (p.value < p.min || p.value > p.max)) ctx.error("T010", `param '${n}': its value ${p.value} lies outside ${p.min}..${p.max}`, { arg: 1, tip: "move the value inside min..max" });
            if (p.options && !p.options.includes(p.value)) ctx.error("T011", `param '${n}': its value is not one of its options`, { arg: 1, suggest: p.options.map(String) });
          } },
        source: { kind: "decl", args: [name("table"), data(SourceShape)] },
        fn: { kind: "unit", unit: "fn" },
        const: { kind: "unit", unit: "const" },
      },
    },
    table: {
      parent: "program",
      opens: [name(), ref("table", { as: "from" })],
      record: "calls",
      state: tableState,
      slots: {
        filter: { kind: "decl", args: [lambda("pred")] },
        derive: { kind: "decl", args: [data("string"), lambda("row")] },
        rename: { kind: "decl", args: [data(recordOf("string"))] },
        cast: { kind: "decl", args: [data(recordOf(COLUMN_TYPE))] },
        trim: { kind: "decl", args: [rest(ref("column"))] },
        replace: { kind: "decl", args: [ref("column"), data(recordOf("string"))] },
        dropNulls: { kind: "decl", args: [rest(ref("column"))] },
        dedupe: { kind: "decl", args: [rest(ref("column"))] },
        select: { kind: "decl", args: [rest(ref("column"))] },
        groupBy: { kind: "decl", args: [rest(ref("column"))] },
        agg: { kind: "decl", args: [data(recordOf(lambda("group")))] },
        keepGroups: { kind: "decl", args: [ref("column"), lambda("gpred")] },
        sort: { kind: "decl", args: [rest(data("string"))] },
        limit: { kind: "decl", args: [data("number")] },
        join: { kind: "decl", args: [ref("table"), data({ on: recordOf("string"), "take?": listOf("string") })] },
        semiJoin: { kind: "decl", args: [ref("table"), data({ on: "string" })] },
        pivot: { kind: "decl", args: [data({ rows: "string", cols: "string", values: lambda("group"), expect: "string[]" })] },
        describe: { kind: "decl", args: [] },
      },
    },
    chart: {
      parent: "program",
      opens: [name(), data(enumOf(["line", "bar", "histogram", "heatmap"]), { as: "mark" }), ref("table", { as: "table" })],
      names: { column: (record, { program, stateOf }) => Object.keys(columnsOf(record.table, program, stateOf)) },
      slots: {
        x: encoding,
        y: { kind: "decl", args: [data(oneOf(ref("column"), lambda("text"))), opt(data(EncodingShape))], once: true },
        color: encoding,
        tooltip: { kind: "decl", args: [rest(ref("column"))], once: true },
        title: { kind: "decl", args: [data(oneOf("string", lambda("text")))], once: true },
      },
    },
  },
});
