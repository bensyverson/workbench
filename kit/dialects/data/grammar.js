// The data Grammar: a program with sources (each with its schema), params, helpers and constants; tables built
// call by call from a source or another table, whose construct state is the table's columns at each step;
// charts over a table, whose encodings are checked against that table's columns; and views, each one table's
// rows. The Dialect (dialect.js) types each lambda from that state. What the kit does not build (layout,
// rendering, agent permissions, pivot and describe, program-editing mutations, SQL text, fragments) is refused
// by name, with the builder form to write instead.
// Started from dogfood trial 2's agent A (scripts/define-trial/runs/2026-11-24-trial-2/agent-a/data.grammar.js).

import { defineGrammar, name, ref, data, lambda, opt, rest, oneOf, recordOf, listOf, enumOf, didYouMean } from "../../define/index.js";
import { data as dialect, COLUMN_TYPES } from "./dialect.js";

/** @import { CheckContext, StepContext, TypeDef } from "../../define/define.js" */
/** @import { Columns } from "./dialect.js" */

/** @typedef {{ columns: Columns, keys: string[] }} TableState */

// `columns` is optional in the shape so that a source without it gets T006 and its fix, not B004's generic tip.
const SourceShape = { csv: "string", "columns?": recordOf("string"), "header?": "boolean" };

const ParamShape = oneOf(
  { value: "number", "min?": "number", "max?": "number", "step?": "number", "options?": "number[]", "label?": "string" },
  { value: "string", "options?": "string[]", "kind?": enumOf(["date"]), "label?": "string" },
  { value: "boolean", "label?": "string" },
);

/** Reads as SQL text: what a table built from pasted SQL gets as its source. */
const SQL_LIKE = /\bselect\b[\s\S]*\bfrom\b/i;

/** @param {Columns} o @param {string[]} keys @returns {Columns} */
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => Object.hasOwn(o, k)).map((k) => [k, o[k]]));

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
 * The keys of a cast's or a rename's map that are columns of the table at this step; T009, with the did-you-mean,
 * for each that is not. (The map's keys are data, not refs, so the builder's B003 cannot see them.)
 * @param {TableState} state @param {Record<string, string>} map @param {string} slot @param {StepContext} ctx
 * @returns {string[]}
 */
function knownColumns(state, map, slot, ctx) {
  const columns = Object.keys(state.columns);
  return Object.keys(map).filter((c) => {
    if (Object.hasOwn(state.columns, c)) return true;
    ctx.error("T009", `${slot}: there is no column '${c}' at this step.${didYouMean(c, columns)}`, `name one of: ${columns.join(", ")}`);
    return false;
  });
}

/**
 * Join keys against both tables, at the step where the join happens (`ctx.stateOf`): T003 for a key that is
 * not a column, T004 for keys of two types (the Dream Code's E-JOIN-TYPE). Returns the other table's columns.
 * @param {TableState} state @param {string} other @param {Record<string, string>} on @param {StepContext} ctx
 * @returns {Columns}
 */
function joinKeys(state, other, on, ctx) {
  const right = columnsIn(ctx, other) ?? {};
  for (const [l, r] of Object.entries(on)) {
    const lt = state.columns[l], rt = right[r];
    if (lt === undefined) ctx.error("T003", `join key '${l}' is not a column of this table`, `columns: ${Object.keys(state.columns).join(", ")}`);
    else if (rt === undefined) ctx.error("T003", `join key '${r}' is not a column of '${other}'`, `columns of ${other}: ${Object.keys(right).join(", ")}`);
    // Only named column types are compared: a type a derive inferred (an enum of string literals) is let through.
    else if (typeof lt === "string" && typeof rt === "string" && lt !== rt) ctx.error("T004", `join key types differ: '${l}' is ${show(lt)}, ${other}.${r} is ${show(rt)}`, "join on two columns of one type, or cast one first");
  }
  return right;
}

/**
 * A join: its keys checked, and the taken columns (by default every column of the other table this one lacks) added.
 * @param {TableState} state @param {[string, { on: Record<string, string>, take?: string[] }]} args @param {StepContext} ctx
 * @returns {TableState}
 */
function join(state, [other, { on, take }], ctx) {
  const right = joinKeys(state, other, on, ctx);
  const names = take ?? Object.keys(right).filter((c) => !(c in state.columns));
  for (const c of names) if (!Object.hasOwn(right, c)) ctx.error("T003", `'${c}' is not a column of '${other}'`, `columns of ${other}: ${Object.keys(right).join(", ")}`);
  // a taken column the table already has: refuse it, and keep the table's own
  const clash = names.filter((c) => Object.hasOwn(right, c) && Object.hasOwn(state.columns, c));
  for (const c of clash) ctx.error("T010", `join: taking '${c}' from '${other}' would give two columns the name '${c}'`, `leave it out of take, or rename it in '${other}' first: .rename({ ${c}: "${other}_${c}" })`);
  return { ...state, columns: { ...state.columns, ...pick(right, names.filter((c) => !clash.includes(c))) } };
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
        /** @type {Record<string, string>} */
        const to = a[0];
        const known = knownColumns(state, to, "rename", ctx);
        /** @type {Columns} */
        const columns = {};
        for (const [c, t] of Object.entries(state.columns)) {
          const n = known.includes(c) ? to[c] : c;
          // renamed onto a column the table keeps (or another rename's): refuse it, and keep the one already there
          if (Object.hasOwn(columns, n) || (n !== c && Object.hasOwn(state.columns, n) && !known.includes(n))) {
            ctx.error("T010", `rename: '${c}' → '${n}' would give two columns the name '${n}'`, `rename '${n}' too, or pick another name`);
            continue;
          }
          columns[n] = t;
        }
        return { ...state, columns };
      }
      case "cast": {
        const known = knownColumns(state, a[0], "cast", ctx);
        return { ...state, columns: { ...state.columns, ...pick(a[0], known) } };
      }
      case "groupBy": return { ...state, keys: a.flat() };
      case "agg": return { ...state, keys: [], columns: { ...pick(state.columns, state.keys), ...inferred } };
      case "join": return join(state, /** @type {any} */ (a), ctx);
      case "semiJoin": joinKeys(state, a[0], a[1].on, ctx); return state;
      case "keepGroups":
        if (inferred !== "bool") ctx.error("T008", `keepGroups' lambda gives ${show(inferred)}, not a bool: it decides which groups to keep`, "compare the aggregate: (g) => g.count() >= 3");
        return state;
      default: return state;
    }
  },
  names: { column: (/** @type {TableState} */ state) => Object.keys(state.columns) },
};

const col = () => ref("column");
/** An encoding: a column of the chart's table, or a lambda over the params that picks one at run time. */
const encoding = () => data(oneOf(col(), lambda("calc")));

const VIEW_FIX = `.view("name", "table").head(20): a view shows one table's rows, and the page lays the Program out`;
const SQL_TIP = "build the query with table methods: .join, .groupBy, .agg, .sort, .limit";
const MUTATION = { message: "program-editing mutations are not part of this language: a Program is built, not edited in place", tip: "change the builder code and build again" };
const RENDERING = { message: "rendering is the host's, not the Program's: a chart is its mark and encodings", tip: "drop it; the page renders a chart from its mark, x, y, color and tooltip" };

export const program = defineGrammar(dialect, {
  root: "program",
  params: { slot: "param" },
  constructs: {
    program: {
      opens: [name()],
      rejected: {
        sql: { message: "SQL text is not an input language", tip: SQL_TIP },
        layout: { message: "layout is not part of a Program: the page lays out its views and charts", tip: VIEW_FIX },
        controls: { message: "controls are not declared: every param is a control the page shows", tip: "drop .controls(…); each control is a .param(name, { … })" },
        charts: { message: "a build-time fan-out over the schema is not built: there are no build-time lambdas", tip: `write one .chart(…) per column: .chart("ageHist", "survey").mark("histogram").x("age", { bins: 30 })` },
        run: { message: "running a Program is the host's", tip: "build it and lower the record: program.lower(p.build())" },
        schema: { message: "a built Program is a record, not an object with methods", tip: "read the schema from lowering: program.lower(p.build()).states.<table>.columns" },
        agent: { message: "agent permissions are not part of a Program", tip: "drop .agent(…); what an agent may change is the host's to decide" },
        fragment: { message: "fragments are not built", tip: "write the fragment's steps out with the table's own calls (.derive, .filter, …)" },
        component: { message: "new components are not built", tip: "write the component's expansion out as tables and charts" },
        env: MUTATION, session: MUTATION, addStep: MUTATION, addTable: MUTATION, addChart: MUTATION, editSource: MUTATION, set: MUTATION, undo: MUTATION,
        title: RENDERING, layer: RENDERING, rule: RENDERING, render: RENDERING, vegaLite: RENDERING,
      },
      slots: {
        source: {
          kind: "decl", args: [name("table"), data(SourceShape)],
          check({ args: [n, s] }, ctx) {
            if (s.columns === undefined) {
              ctx.error("T006", `source '${n}' declares no columns: the kit infers no types from a CSV`, { arg: 1, tip: `declare its schema: { csv: "${s.csv}", columns: { date: "date", region: "str", units: "f64" } }, each a column type (${COLUMN_TYPES.join(", ")})` });
            } else checkColumnTypes(s.columns, ctx, 1);
          },
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
      rejected: {
        describe: { message: "describe is not built: a profile's columns depend on the data's", tip: `aggregate the columns you want, with no .groupBy (one row): .agg({ n: (g) => g.count(), scoreMean: (g) => g.mean("score") })` },
        pivot: { message: "pivot is not built: its columns come from the data, which only a build-time step could read", tip: `keep it long: .groupBy("team", "quarter").agg({ score: (g) => g.mean("score") })` },
        grid: { message: "a grid is a view, not a table step", tip: VIEW_FIX },
        head: { message: "the first rows are a view, not a table step", tip: VIEW_FIX },
        column: { message: "column attributes (units, currencies) are not built", tip: "drop .column(…); a column is its name and type" },
        quantiles: { message: "quantiles need the data at build time, and there are no build-time lambdas", tip: `make the bounds params, .param("hi", { value: 500 }), and read $.hi in a lambda` },
      },
      check(record, ctx) {
        if (typeof record.from === "string" && SQL_LIKE.test(record.from)) {
          ctx.error("T005", `table '${record.name}' got a string that reads as SQL; SQL text is not an input language`, { arg: 1, tip: SQL_TIP });
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
        semiJoin: { kind: "decl", args: [ref("table"), data({ on: recordOf("string") })] },
        keepGroups: { kind: "decl", args: [data(oneOf(col(), listOf(col()))), lambda("group")] },
        sort: {
          kind: "decl", args: [rest(col())],
          check({ args }, ctx) {
            for (const c of args.flat()) if (typeof c === "string" && c.startsWith("-")) ctx.error("T002", `'${c}': a leading '-' does not sort descending here`, { tip: `.sortDesc("${c.slice(1)}")`, fix: `.sortDesc("${c.slice(1)}")` });
          },
        },
        sortDesc: { kind: "decl", args: [rest(col())] },
        // a number, which build-time code may read from a param: .limit($.topN), not .limit(() => $.topN)
        limit: { kind: "decl", args: [data("number")] },
      },
    },
    chart: {
      parent: "program",
      opens: [name(), ref("table")],
      // Its encodings name columns of its table at that table's last step, or of a source's schema: checked when
      // lowered (B003, with the did-you-mean), since a table's columns exist only then.
      names: { column: (record, ctx) => Object.keys(columnsIn(ctx, record.table) ?? {}) },
      slots: {
        mark: { kind: "decl", args: [data(enumOf(["line", "bar", "histogram", "heatmap"]))], once: true, required: true },
        x: { kind: "decl", args: [encoding(), opt(data({ "type?": enumOf(["time", "ordinal"]), "bins?": "number", "format?": oneOf("string", lambda("calc")) }))], once: true },
        y: { kind: "decl", args: [encoding(), opt(data({ "type?": enumOf(["time", "ordinal"]), "sort?": enumOf(["x", "-x", "y", "-y"]), "format?": oneOf("string", lambda("calc")) }))], once: true },
        color: { kind: "decl", args: [col(), opt(data({ "scheme?": "string", "format?": "string" }))], once: true },
        tooltip: { kind: "decl", args: [rest(col())], once: true },
      },
    },
    view: {
      parent: "program",
      // The table is optional in the opening so that a lambda in the name's place (layout) is T007, not B004.
      opens: [name(), opt(ref("table"))],
      check(record, ctx) {
        if (typeof record.name !== "string") ctx.error("T007", "a view is not a lambda over the tables: layout is not part of a Program", { arg: 0, tip: VIEW_FIX, fix: `.view("name", "table")` });
        else if (record.table === undefined) ctx.error("T007", `view '${record.name}' shows no table`, { tip: VIEW_FIX, fix: `.view("${record.name}", "table")` });
      },
      slots: {
        head: { kind: "decl", args: [data("number")], once: true },
      },
    },
  },
});
