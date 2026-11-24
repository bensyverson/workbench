import { defineGrammar, name, ref, data, lambda, opt, rest, oneOf, recordOf, listOf, enumOf } from "kit/define";
import { data as dialect } from "./data.dialect.js";

const ColumnType = enumOf(["str", "f64", "bool", "date"]);

const ParamShape = oneOf(
  { value: "number", "options?": "number[]", "min?": "number", "max?": "number", "step?": "number", "label?": "string" },
  { value: "string", "options?": "string[]", "type?": enumOf(["date"]), "label?": "string" },
  { value: "boolean", "label?": "string" },
);

const colsOf = (name, program, stateOf) => program.source?.[name]?.columns ?? stateOf(name).columns;

export const program = defineGrammar(dialect, {
  root: "program",
  params: { slot: "param" },
  constructs: {
    program: {
      opens: [name()],
      rejected: {
        sql: { message: "SQL text is not an input language", tip: "build the query with table methods: .join, .groupBy, .agg, .sort, .limit" },
      },
      slots: {
        param: {
          kind: "decl", args: [name("param"), data(ParamShape)],
          check({ args: [n, p] }, ctx) {
            if (typeof p.value === "number" && (p.value < (p.min ?? -Infinity) || p.value > (p.max ?? Infinity)))
              ctx.error("T002", `param '${n}': its value ${p.value} lies outside its range`, { arg: 1, tip: "move the value inside min..max" });
          },
        },
        source: {
          kind: "decl", as: "source",
          args: [name("relation"), data({ csv: "string", "header?": "boolean", columns: recordOf(ColumnType) })],
        },
        fn: { kind: "unit", unit: "fn" },
        const: { kind: "unit", unit: "const" },
      },
    },
    table: {
      parent: "program",
      opens: [name("relation"), ref("relation", { as: "from" })],
      record: "calls",
      rejected: {
        sql: { message: "SQL text is not an input language", tip: "build the query with table methods: .join, .groupBy, .agg, .sort, .limit", fix: ".join(other, { on: { a: \"b\" } }).groupBy(…).agg({ … })" },
      },
      state: {
        init(opened, { program, stateOf }) {
          return { columns: { ...colsOf(opened.from, program, stateOf) } };
        },
        step(state, call, inferred, ctx) {
          const a = call.args;
          const unknown = (c, i) => { if (!(c in state.columns)) ctx.error("T003", `no column "${c}" on table "${ctx.name ?? "this table"}"`, { arg: i, tip: `columns: ${Object.keys(state.columns).join(", ")}` }); };
          switch (call.slot) {
            case "derive": return { ...state, columns: { ...state.columns, [a[0]]: inferred } };
            case "rename": {
              const cols = {};
              for (const [c, t] of Object.entries(state.columns)) cols[a[0][c] ?? c] = t;
              for (const c of Object.keys(a[0])) unknown(c, 0);
              return { ...state, columns: cols };
            }
            case "cast": {
              for (const c of Object.keys(a[0])) unknown(c, 0);
              return { ...state, columns: { ...state.columns, ...a[0] } };
            }
            case "select": return { ...state, columns: Object.fromEntries(a.map((c) => [c, state.columns[c]])) };
            case "groupBy": return { ...state, keys: a };
            case "agg": {
              const keys = state.keys ?? [];
              return { columns: { ...Object.fromEntries(keys.map((k) => [k, state.columns[k]])), ...inferred } };
            }
            case "sort": { for (const s of a) unknown(s.replace(/^-/, ""), 0); return state; }
            case "join": {
              const other = colsOf(a[0], ctx.program, ctx.stateOf);
              for (const [l, r] of Object.entries(a[1].on)) {
                if (!(l in state.columns)) { unknown(l, 1); continue; }
                if (!(r in other)) { ctx.error("T004", `no column "${r}" on "${a[0]}"`, { arg: 1, tip: `columns: ${Object.keys(other).join(", ")}` }); continue; }
                if (state.columns[l] !== other[r]) ctx.error("T001", `join key types differ: ${l} is ${state.columns[l]}, ${a[0]}.${r} is ${other[r]}`, { arg: 1, tip: "join columns of one type" });
              }
              const take = a[1].take ?? Object.keys(other);
              return { ...state, columns: { ...state.columns, ...Object.fromEntries(take.map((c) => [c, other[c]])) } };
            }
            default: return state;
          }
        },
        names: { column: (state) => Object.keys(state.columns) },
      },
      slots: {
        filter: { kind: "decl", args: [lambda("rowTest")] },
        derive: { kind: "decl", args: [data("string"), lambda("row")] },
        rename: { kind: "decl", args: [data(recordOf("string"))] },
        cast: { kind: "decl", args: [data(recordOf(ColumnType))] },
        trim: { kind: "decl", args: [rest(ref("column"))] },
        replace: { kind: "decl", args: [ref("column"), data(recordOf("string"))] },
        dropNulls: { kind: "decl", args: [rest(ref("column"))] },
        dedupe: { kind: "decl", args: [rest(ref("column"))] },
        select: { kind: "decl", args: [rest(ref("column"))] },
        groupBy: { kind: "decl", args: [rest(ref("column"))] },
        agg: { kind: "decl", args: [data(recordOf(lambda("group")))] },
        keepGroups: { kind: "decl", args: [ref("column"), lambda("groupTest")] },
        sort: { kind: "decl", args: [rest(data("string"))] },
        limit: { kind: "decl", args: [data("number")] },
        join: { kind: "decl", args: [ref("relation"), data({ on: recordOf("string"), "take?": listOf("string") })] },
        semiJoin: { kind: "decl", args: [ref("relation"), data({ on: recordOf("string") })] },
      },
    },
    chart: {
      parent: "program",
      opens: [name(), ref("relation", { as: "table" })],
      names: { column: (record, { program, stateOf }) => Object.keys(colsOf(record.table, program, stateOf)) },
      slots: {
        mark: { kind: "decl", args: [data(enumOf(["line", "bar", "histogram", "heatmap"]))], once: true, required: true },
        x: { kind: "decl", args: [ref("column"), opt(data({ "type?": enumOf(["time", "ordinal"]), "bins?": "number" }))], once: true },
        y: { kind: "decl", args: [ref("column"), opt(data({ "type?": enumOf(["time", "ordinal"]), "sort?": "string", "format?": "string" }))], once: true },
        color: { kind: "decl", args: [ref("column"), opt(data({ "scheme?": "string", "format?": "string" }))], once: true },
        tooltip: { kind: "decl", args: [rest(ref("column"))], once: true },
        title: { kind: "decl", args: [data("string")], once: true },
      },
    },
  },
});
