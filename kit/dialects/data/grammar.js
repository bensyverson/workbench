// The data Grammar, as far as the Dream Code's examples 2 to 5 need it to build a record: a program with
// sources (each with its schema), params, helpers and constants; tables built call by call from a source or
// another table, whose construct state is the table's columns at each step; and charts over a table. The
// Dialect (dialect.js) types each lambda from that state. The full Grammar is a later leaf.
// Started from dogfood trial 2's agent A (scripts/define-trial/runs/2026-11-24-trial-2/agent-a/data.grammar.js).

import { defineGrammar, name, ref, data, lambda, opt, rest, oneOf, recordOf, listOf, enumOf } from "../../define/index.js";
import { data as dialect, COLUMN_TYPES } from "./dialect.js";

/** @import { CheckContext, StepContext, TypeDef } from "../../define/define.js" */
/** @import { Columns } from "./dialect.js" */

/** @typedef {{ columns: Columns, keys: string[] }} TableState */

const SourceShape = { csv: "string", columns: recordOf("string"), "header?": "boolean" };

const ParamShape = oneOf(
  { value: "number", "min?": "number", "max?": "number", "step?": "number", "options?": "number[]", "label?": "string" },
  { value: "string", "options?": "string[]", "kind?": enumOf(["date"]), "label?": "string" },
  { value: "boolean", "label?": "string" },
);

/** Reads as SQL text: what a table built from pasted SQL gets as its source. */
const SQL_LIKE = /\bselect\b[\s\S]*\bfrom\b/i;

/** @param {Columns} o @param {string[]} keys @returns {Columns} */
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, o[k]]));

/**
 * The columns of a source or a table, by name: a source's declared schema, else that table's final state.
 * @param {{ program: Record<string, any>, stateOf(name: string): any }} ctx @param {string} n
 * @returns {Columns | undefined}
 */
function columnsIn(ctx, n) {
  const src = ctx.program.source?.[n];
  return src ? { ...src.columns } : /** @type {TableState | undefined} */ (ctx.stateOf(n))?.columns;
}

/** @param {TypeDef} t */
const show = (t) => (typeof t === "string" ? t : "a computed type");

/**
 * T001 for each value of a schema or a cast that is not a column type, with the fix.
 * @param {Record<string, string>} columns @param {CheckContext} ctx @param {number} arg
 */
function checkColumnTypes(columns, ctx, arg) {
  for (const [c, t] of Object.entries(columns)) {
    if (COLUMN_TYPES.includes(t)) continue;
    const tip = /^(int|integer|i32|i64)$/i.test(t) ? `use "f64": there is no integer type, and a whole number is an f64` : `a column type is one of ${COLUMN_TYPES.join(", ")}`;
    ctx.error("T001", `column '${c}': '${t}' is not a column type`, { arg, tip, ...(/^int/i.test(t) ? { fix: `"f64"` } : {}) });
  }
}

/**
 * A join: the other table's columns, at the step where the join happens (`ctx.stateOf`), with T003 for a key that
 * is not a column and T004 for keys of two types (the Dream Code's E-JOIN-TYPE).
 * @param {TableState} state @param {[string, { on: Record<string, string>, take?: string[] }]} args @param {StepContext} ctx
 * @returns {TableState}
 */
function join(state, [other, { on, take }], ctx) {
  const right = columnsIn(ctx, other) ?? {};
  for (const [l, r] of Object.entries(on)) {
    const lt = state.columns[l], rt = right[r];
    if (lt === undefined) ctx.error("T003", `join key '${l}' is not a column of this table`, `columns: ${Object.keys(state.columns).join(", ")}`);
    else if (rt === undefined) ctx.error("T003", `join key '${r}' is not a column of '${other}'`, `columns of ${other}: ${Object.keys(right).join(", ")}`);
    // Only named column types are compared: a type a derive inferred (an enum of string literals) is let through.
    else if (typeof lt === "string" && typeof rt === "string" && lt !== rt) ctx.error("T004", `join key types differ: '${l}' is ${show(lt)}, ${other}.${r} is ${show(rt)}`, "join on two columns of one type, or cast one first");
  }
  const names = take ?? Object.keys(right).filter((c) => !(c in state.columns));
  for (const c of names) if (!(c in right)) ctx.error("T003", `'${c}' is not a column of '${other}'`, `columns of ${other}: ${Object.keys(right).join(", ")}`);
  return { ...state, columns: { ...state.columns, ...pick(right, names) } };
}

const tableState = {
  /** @param {Record<string, any>} opened @param {{ program: Record<string, any>, stateOf(name: string): any }} ctx @returns {TableState} */
  init(opened, ctx) {
    return { columns: { ...columnsIn(ctx, opened.from) }, keys: [] };
  },
  /** @param {TableState} state @param {{ slot: string, args: any[] }} call @param {any} inferred @param {StepContext} ctx @returns {TableState} */
  step(state, call, inferred, ctx) {
    const a = call.args;
    switch (call.slot) {
      case "derive": return { ...state, columns: { ...state.columns, [a[0]]: inferred } };
      case "rename": {
        /** @type {Columns} */
        const columns = {};
        for (const [c, t] of Object.entries(state.columns)) columns[a[0][c] ?? c] = t;
        return { ...state, columns };
      }
      case "cast": return { ...state, columns: { ...state.columns, ...a[0] } };
      case "groupBy": return { ...state, keys: a.flat() };
      case "agg": return { ...state, keys: [], columns: { ...pick(state.columns, state.keys), ...inferred } };
      case "join": return join(state, /** @type {any} */ (a), ctx);
      default: return state;
    }
  },
  names: { column: (/** @type {TableState} */ state) => Object.keys(state.columns) },
};

const col = () => ref("column");

export const program = defineGrammar(dialect, {
  root: "program",
  constructs: {
    program: {
      opens: [name()],
      rejected: {
        sql: { message: "SQL text is not an input language", tip: "build the query with table methods: .join, .groupBy, .agg, .sort, .limit" },
        view: { message: "layout and views are not part of this language yet", tip: "drop the .view call; tables and charts are the Program" },
      },
      slots: {
        source: {
          kind: "decl", args: [name("table"), data(SourceShape)],
          check({ args: [, s] }, ctx) { checkColumnTypes(s.columns, ctx, 1); },
        },
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
      check(record, ctx) {
        if (typeof record.from === "string" && SQL_LIKE.test(record.from)) {
          ctx.error("T005", `table '${record.name}' got a string that reads as SQL; SQL text is not an input language`, { arg: 1, tip: "build the query with table methods: .join, .groupBy, .agg, .sort, .limit" });
        }
      },
      slots: {
        rename: { kind: "decl", args: [data(recordOf("string"))] },
        cast: { kind: "decl", args: [data(recordOf("string"))], check({ args: [m] }, ctx) { checkColumnTypes(m, ctx, 0); } },
        trim: { kind: "decl", args: [rest(col())] },
        replace: { kind: "decl", args: [col(), data(recordOf("string"))] },
        dropNulls: { kind: "decl", args: [rest(col())] },
        dedupe: { kind: "decl", args: [rest(col())] },
        derive: { kind: "decl", args: [data("string"), lambda("row")] },
        filter: { kind: "decl", args: [lambda("pred")] },
        groupBy: { kind: "decl", args: [rest(col())] },
        agg: { kind: "decl", args: [data(recordOf(lambda("group")))] },
        join: { kind: "decl", args: [ref("table"), data({ on: recordOf("string"), "take?": listOf("string") })] },
        sort: {
          kind: "decl", args: [rest(col())],
          check({ args }, ctx) {
            for (const c of args.flat()) if (typeof c === "string" && c.startsWith("-")) ctx.error("T002", `'${c}': a leading '-' does not sort descending here`, { tip: `.sortDesc("${c.slice(1)}")`, fix: `.sortDesc("${c.slice(1)}")` });
          },
        },
        sortDesc: { kind: "decl", args: [rest(col())] },
        limit: { kind: "decl", args: [data(oneOf("number", lambda("calc")))] },
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
      },
    },
  },
});
