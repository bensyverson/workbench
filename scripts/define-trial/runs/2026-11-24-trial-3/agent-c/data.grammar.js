import { defineGrammar, name, ref, data, lambda, rest, oneOf, recordOf, listOf, enumOf } from "kit/define";
import { data as dialect } from "./data.dialect.js";

const ParamShape = oneOf(
  { value: "number", "min?": "number", "max?": "number", "date?": "boolean", "options?": "number[]" },
  { value: "string", "options?": "string[]" },
  { value: "boolean" },
);

const ColumnType = enumOf(["f64", "str", "bool", "date"]);
const ColumnsShape = recordOf(ColumnType);

// A relation's state, as the steps leave it. Errors use the Dialect's letter T.
const relationState = {
  step: (state) => state,
  names: { column: (state) => Object.keys(state.columns) },
};

const pick = (columns, names) => Object.fromEntries(names.filter((n) => n in columns).map((n) => [n, columns[n]]));

export const program = defineGrammar(dialect, {
  root: "program",
  params: { slot: "param" },
  constructs: {
    program: {
      opens: [name()],
      rejected: {
        sql: { message: "SQL text is not an input language", tip: "build the query with table methods: .join, .groupBy, .agg" },
      },
      slots: {
        param: {
          kind: "decl", args: [name("param"), data(ParamShape)], as: "params",
          check({ args: [n, p] }, ctx) {
            if (typeof p.value === "number" && (p.value < (p.min ?? -Infinity) || p.value > (p.max ?? Infinity)))
              ctx.error("T010", `param '${n}': its value ${p.value} lies outside its range`, { arg: 1, tip: "move the value inside min..max" });
          },
        },
      },
    },
    source: {
      parent: "program",
      opens: [name("relation"), data(ColumnsShape, { as: "columns" })],
      record: "calls",
      state: {
        init(opened) {
          return { columns: { ...opened.columns }, keys: [] };
        },
        ...relationState,
      },
      slots: {},
    },
    table: {
      parent: "program",
      opens: [name("relation"), ref("relation", { as: "from" })],
      record: "calls",
      state: {
        init(opened, { stateOf }) {
          return { columns: { ...stateOf(opened.from).columns }, keys: [] };
        },
        step(state, call, inferred, ctx) {
          const [a, b] = call.args;
          switch (call.slot) {
            case "derive":
              return { ...state, columns: { ...state.columns, [a]: inferred } };
            case "filter":
            case "keepGroups":
              if (inferred !== "bool") ctx.error("T001", `${call.slot} needs a bool, got ${inferred}`, "compare the value, e.g. row.units > 0");
              return state;
            case "rename": {
              for (const old of Object.keys(a)) if (!(old in state.columns))
                ctx.error("T002", `rename: no column "${old}"`, { suggest: Object.keys(state.columns) });
              const columns = {};
              for (const [c, t] of Object.entries(state.columns)) columns[a[c] ?? c] = t;
              return { ...state, columns, keys: state.keys.map((k) => a[k] ?? k) };
            }
            case "cast":
              for (const c of Object.keys(a)) if (!(c in state.columns))
                ctx.error("T002", `cast: no column "${c}"`, { suggest: Object.keys(state.columns) });
              return { ...state, columns: { ...state.columns, ...a } };
            case "replace":
              if (state.columns[a] !== "str") ctx.error("T003", `replace needs a str column; "${a}" is ${state.columns[a]}`);
              return state;
            case "sort":
              for (const s of call.args) {
                const c = s.replace(/^-/, "");
                if (!(c in state.columns)) ctx.error("T004", `sort: no column "${c}"`, { suggest: Object.keys(state.columns) });
              }
              return state;
            case "groupBy":
              return { ...state, keys: call.args };
            case "agg":
              return { columns: { ...pick(state.columns, state.keys), ...inferred }, keys: state.keys };
            case "select": {
              const columns = pick(state.columns, call.args);
              return { columns, keys: state.keys.filter((k) => k in columns) };
            }
            case "join": {
              const other = ctx.stateOf(a);
              const take = b.take ?? Object.keys(other.columns).filter((c) => !(c in Object.fromEntries(Object.entries(b.on).map(([l, r]) => [r, l]))));
              for (const [l, r] of Object.entries(b.on)) {
                if (!(l in state.columns)) ctx.error("T005", `join: no column "${l}" on this table`, { suggest: Object.keys(state.columns) });
                else if (!(r in other.columns)) ctx.error("T005", `join: no column "${r}" on "${a}"`, { suggest: Object.keys(other.columns) });
                else if (state.columns[l] !== other.columns[r]) ctx.error("T005", `join: "${l}" is ${state.columns[l]} but "${r}" is ${other.columns[r]}`);
              }
              const columns = { ...state.columns };
              for (const c of take) {
                if (c in state.columns) ctx.error("T006", `join: "${c}" is already a column here`);
                columns[c] = other.columns[c];
              }
              return { columns, keys: state.keys };
            }
            case "semiJoin": {
              const on = typeof b.on === "string" ? { [b.on]: b.on } : b.on;
              const other = ctx.stateOf(a);
              for (const [l, r] of Object.entries(on)) {
                if (!(l in state.columns) || !(r in other.columns))
                  ctx.error("T007", `semiJoin: key "${l}" must exist on both tables`);
              }
              return state;
            }
            default:
              return state;
          }
        },
        names: { column: (state) => Object.keys(state.columns) },
      },
      slots: {
        derive: { kind: "decl", args: [data("string"), lambda("row")] },
        filter: { kind: "decl", args: [lambda("row")] },
        rename: { kind: "decl", args: [data(recordOf("string"))] },
        cast: { kind: "decl", args: [data(recordOf(ColumnType))] },
        trim: { kind: "decl", args: [rest(ref("column"))] },
        replace: { kind: "decl", args: [ref("column"), data(recordOf("string"))] },
        dropNulls: { kind: "decl", args: [data(listOf(ref("column")))] },
        dedupe: { kind: "decl", args: [data(listOf(ref("column")))] },
        select: { kind: "decl", args: [rest(ref("column"))] },
        groupBy: { kind: "decl", args: [rest(ref("column"))] },
        agg: { kind: "decl", args: [data(recordOf(lambda("group")))] },
        sort: { kind: "decl", args: [rest(data("string"))] },
        limit: { kind: "decl", args: [data("number")] },
        join: { kind: "decl", args: [ref("relation"), data({ on: recordOf("string"), "take?": listOf("string") })] },
        semiJoin: { kind: "decl", args: [ref("relation"), data(oneOf({ on: recordOf("string") }, { on: "string" }))] },
        keepGroups: { kind: "decl", args: [ref("column"), lambda("group")] },
      },
    },
  },
});
