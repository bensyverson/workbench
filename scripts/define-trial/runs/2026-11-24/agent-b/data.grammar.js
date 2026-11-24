import { defineGrammar, name, ref, data, oneOf, rest, enumOf, recordOf } from "kit/define";
import { data as dataDialect, schemas, opened, COLUMN_TYPES } from "./data.dialect.js";

const ColumnType = enumOf(COLUMN_TYPES);

// A source must declare its columns: environment(program) sees only the record,
// never the file, so types cannot be inferred from the data (see REPORT.md).
const SourceShape = { csv: "string", "header?": "boolean", columns: recordOf(ColumnType) };

const ParamShape = oneOf(
  { slider: { value: "number", min: "number", max: "number", "step?": "number", "label?": "string" } },
  { select: { value: "string", options: "string[]", "label?": "string" } },
  { selectNumber: { value: "number", options: "number[]", "label?": "string" } },
  { selectFrom: { value: "string", table: "string", column: "string", "label?": "string" } },
  { date: { value: "string", "label?": "string" } },
  { toggle: { value: "boolean", "label?": "string" } },
);

const JoinShape = { on: oneOf("string", recordOf("string")), "take?": "string[]" };

const EncodingOptions = {
  "type?": enumOf(["quantitative", "time", "ordinal", "nominal"]),
  "format?": "string",
  "sort?": "string",
  "bins?": "number",
  "scheme?": "string",
};

const SQL = /^\s*(select|with)\s/i;

/** Columns of a table before step i (or after its last step). */
function columnsAt(program, table, i) {
  const s = schemas(program)[table];
  if (!s) return null;
  return i === undefined || i >= s.before.length ? s.after : s.before[i];
}

function currentTable(ctx) {
  const tables = ctx.program.table ?? [];
  return tables[tables.length - 1];
}

/** A slot check: every named column exists on the table as it stands. */
function columnsExist(pick) {
  return (call, ctx) => {
    const rec = currentTable(ctx);
    if (!rec) return;
    const { name: table } = opened(rec);
    const cols = columnsAt(ctx.program, table, (rec.calls ?? []).length);
    if (!cols) return;
    pick(call.args).forEach(([col, arg]) => {
      const c = col.startsWith("-") ? col.slice(1) : col;
      if (!(c in cols)) {
        ctx.error("W001", `no column "${c}" on table "${table}"`, { arg, suggest: Object.keys(cols), tip: `columns: ${Object.keys(cols).join(", ")}` });
      }
    });
  };
}

/** A join's key pairs have the same column type on both sides. */
function joinKeysMatch(call, ctx) {
  const rec = currentTable(ctx);
  if (!rec) return;
  const { name: table } = opened(rec);
  const left = columnsAt(ctx.program, table, (rec.calls ?? []).length);
  const right = columnsAt(ctx.program, call.args[0]);
  if (!left || !right) return;
  const on = typeof call.args[1].on === "string" ? { [call.args[1].on]: call.args[1].on } : call.args[1].on;
  for (const [l, r] of Object.entries(on)) {
    if (!(l in left)) ctx.error("W001", `no column "${l}" on table "${table}"`, { arg: 1, suggest: Object.keys(left) });
    else if (!(r in right)) ctx.error("W001", `no column "${r}" on table "${call.args[0]}"`, { arg: 1, suggest: Object.keys(right) });
    else if (left[l] !== right[r]) ctx.error("W005", `join key types differ: ${table}.${l} is ${left[l]}, ${call.args[0]}.${r} is ${right[r]}`, { arg: 1 });
  }
}

const firstArg = (args) => [[args[0], 0]];
const allArgs = (args) => args.map((c, i) => [c, i]);
const listArg = (args) => (args[0] ?? []).map((c) => [c, 0]);
const keysArg = (args) => Object.keys(args[0] ?? {}).map((c) => [c, 0]);

export const program = defineGrammar(dataDialect, {
  root: "program",
  constructs: {
    program: {
      opens: [name()],
      slots: {
        source: { kind: "decl", args: [name("table"), data(SourceShape)], as: "sources" },
        param: { kind: "decl", args: [name("param"), data(ParamShape)], as: "params" },
        fn: { kind: "unit", unit: "fn" },
        const: { kind: "unit", unit: "const" },
      },
      rejected: {
        sql: { message: "SQL text is not an input language", tip: "build the query with table methods: .table(name, from).join(…).groupBy(…).agg(…).sort(…).limit(…)" },
        view: { message: "views and layout are not part of this language yet: a Program declares data and charts, it does not render them", tip: "declare the table or chart; the host decides how to show it" },
        charts: { message: "a fan-out of charts over the schema needs a build-time lambda, which this language does not have", tip: "declare each chart with .chart(name, table, mark)" },
        component: { message: "new components cannot be declared from a Program", tip: "write the component's expansion out as tables" },
        fragment: { message: "fragments (new methods or attributes on a construct) are not supported", tip: "write the method's expansion out with the core table methods" },
        agent: { message: "agent permissions are not part of a Program in this language", tip: "grant them where the program is opened for editing" },
      },
    },

    table: {
      parent: "program",
      opens: [name("table"), ref("table")],     // .table("sales", "raw")
      record: "calls",
      slots: {
        rename: { kind: "decl", args: [data(recordOf("string"))], check: columnsExist(keysArg) },
        cast: { kind: "decl", args: [data(recordOf(ColumnType))], check: columnsExist(keysArg) },
        trim: { kind: "decl", args: [rest(data("string"))], check: columnsExist(allArgs) },
        replace: { kind: "decl", args: [data("string"), data(recordOf("string"))], check: columnsExist(firstArg) },
        dropNulls: { kind: "decl", args: [data("string[]")], check: columnsExist(listArg) },
        dedupe: { kind: "decl", args: [data("string[]")], check: columnsExist(listArg) },
        select: { kind: "decl", args: [rest(data("string"))], check: columnsExist(allArgs) },
        groupBy: { kind: "decl", args: [rest(data("string"))], check: columnsExist(allArgs) },
        sort: { kind: "decl", args: [rest(data("string"))], check: columnsExist(allArgs) },
        join: { kind: "decl", args: [ref("table"), data(JoinShape)], check: joinKeysMatch },
        semiJoin: { kind: "decl", args: [ref("table"), data({ on: oneOf("string", recordOf("string")) })] },
        // The column's type is stated: environment() cannot see a lambda's inferred type.
        derive: { kind: "lambda", slot: "derive", args: [data("string"), data(ColumnType)] },
        filter: { kind: "lambda", slot: "filter" },
        agg: { kind: "lambda", slot: "agg", args: [data("string"), data(ColumnType)] },
        keepGroups: { kind: "lambda", slot: "keepGroups", args: [data("string")], check: columnsExist(firstArg) },
        limit: { kind: "lambda", slot: "limit" },
      },
      check(rec, ctx) {
        const { name: table, from } = opened(rec);
        if (typeof from === "string" && SQL.test(from)) {
          ctx.error("W002", `table "${table}" got a string that reads as SQL. The language does not take SQL text`, {
            arg: 1,
            tip: "build the query with table methods: .table(name, from).join(…).groupBy(…).agg(…).sort(…).limit(…)",
          });
        }
        (rec.calls ?? []).forEach((call, i) => {
          if (call.slot !== "agg") return;
          const prev = rec.calls[i - 1]?.slot;
          if (prev !== "groupBy" && prev !== "agg") ctx.error("W003", `agg "${call.args[0]}" must follow groupBy(…) or another agg`, { tip: "add .groupBy(…) before it" });
        });
      },
    },

    chart: {
      parent: "program",
      opens: [name("chart"), ref("table"), data(enumOf(["line", "bar", "heatmap", "histogram"]))],
      slots: {
        x: { kind: "decl", args: [data("string"), rest(data(EncodingOptions))], once: true },
        // A y bound to a param follows it at run time: { param: "metric" }.
        y: { kind: "decl", args: [data(oneOf("string", { param: "string" })), rest(data(EncodingOptions))], once: true },
        color: { kind: "decl", args: [data("string"), rest(data(EncodingOptions))], once: true },
        tooltip: { kind: "decl", args: [rest(data("string"))], once: true },
        title: { kind: "decl", args: [data("string")], once: true },
      },
      rejected: {
        rule: { message: "reference rules are a fragment in the Dream Code; this language has no fragments", tip: "derive a constant column and layer it as its own chart" },
        layer: { message: "layered charts are not supported", tip: "declare a second chart" },
      },
      check(rec, ctx) {
        const table = rec.table ?? (Array.isArray(rec.chart) ? rec.chart[1] : undefined);
        const cols = columnsAt(ctx.program, table);
        if (!cols) return;
        const named = [];
        for (const k of ["x", "y", "color"]) {
          const v = Array.isArray(rec[k]) ? rec[k][0] : rec[k];
          if (typeof v === "string") named.push([k, v]);
          if (v && typeof v === "object" && "param" in v && !(v.param in (ctx.program.params ?? {}))) {
            ctx.error("W004", `chart encoding ${k} names no param "${v.param}"`, { suggest: Object.keys(ctx.program.params ?? {}) });
          }
        }
        for (const c of [].concat(rec.tooltip ?? [])) named.push(["tooltip", c]);
        for (const [k, c] of named) {
          if (!(c in cols)) ctx.error("W001", `encoding ${k} names "${c}", not a column of "${table}"`, { suggest: Object.keys(cols) });
        }
      },
    },
  },
});
