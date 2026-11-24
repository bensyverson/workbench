import { defineGrammar, name, ref, data as arg, oneOf, rest, enumOf, recordOf } from "kit/define";
import { data, schemaOf } from "./data.dialect.js";

// Codes from this language's checks start with W (workbench); D is the kit's.

const COLUMN_TYPE = enumOf(["f64", "str", "bool"]);

const SourceShape = { csv: "string", columns: recordOf(COLUMN_TYPE), "header?": "boolean" };

const ParamShape = oneOf(
  { value: "number", "min?": "number", "max?": "number", "step?": "number", "label?": "string" },
  { value: "number", options: "number[]", "label?": "string" },
  { value: "string", options: "string[]", "label?": "string" },
  { value: "string", distinctOf: { table: "string", column: "string" }, "label?": "string" },
  { value: "string", "date?": "boolean", "label?": "string" },
  { value: "boolean", "label?": "string" },
);

const Encoding = oneOf(
  "string",
  {
    field: "string",
    "type?": enumOf(["time", "ordinal", "quantitative", "nominal"]),
    "sort?": "string",
    "format?": "string",
    "bins?": "number",
    "scheme?": "string",
  },
  { param: "string", "format?": "string" },
);

const SQL = /^\s*(select|with)\b[\s\S]*\bfrom\b/i;

/** The columns a table step sees: the input of the table, replayed up to the current call. */
function columnsNow(ctx) {
  const tables = ctx.program.table ?? [];
  const current = tables[tables.length - 1];
  return current ? schemaOf({ ...ctx.program, table: tables }, current.name, new Set()) : {};
}

/** Reports each named column that the table does not have at this step. */
function checkColumns(names, ctx, argAt = () => 0) {
  const cols = columnsNow(ctx);
  names.forEach((n, i) => {
    const bare = n.replace(/^-/, "");
    if (!(bare in cols))
      ctx.error("W001", `no column "${bare}" at this step`, {
        arg: argAt(i), suggest: Object.keys(cols), tip: `columns: ${Object.keys(cols).join(", ")}`,
      });
  });
}

const columnsArg = { check: ({ args }, ctx) => checkColumns(args, ctx, (i) => i) };

export const program = defineGrammar(data, {
  root: "program",
  constructs: {
    program: {
      opens: [name()],
      slots: {
        source: { kind: "decl", args: [name("table"), arg(SourceShape)], as: "sources" },
        param: {
          kind: "decl", args: [name("param"), arg(ParamShape)], as: "params",
          check({ args: [n, p] }, ctx) {
            if (typeof p.value === "number" && (p.value < (p.min ?? -Infinity) || p.value > (p.max ?? Infinity)))
              ctx.error("W002", `param '${n}': its value ${p.value} lies outside its range`, { arg: 1, tip: "move the value inside min..max" });
            if (p.options && !p.options.includes(p.value))
              ctx.error("W003", `param '${n}': its value is not one of its options`, { arg: 1, suggest: p.options.map(String) });
          },
        },
        fn: { kind: "unit", unit: "fn" },
        const: { kind: "unit", unit: "const" },
      },
      rejected: {
        sql: { message: "SQL text is not an input language", tip: "build the query with table methods: .join, .groupBy, .agg, .sort, .limit" },
        view: { message: "views and layout are not part of this language yet", tip: "declare tables and charts; a host page shows them" },
        charts: { message: "a chart per column needs a build-time lambda, which this language does not take", tip: "declare each chart with .chart(name, table, mark)" },
        fragment: { message: "fragments are not part of this language", tip: "use the built-in table steps (.winsorize, .zscore, .column) and chart steps (.rule)" },
        component: { message: "custom components are not part of this language", tip: "write the steps out as a table" },
        cohort: { message: "there is no cohort component", tip: "write the cohort's steps out as tables" },
        agent: { message: "agent permissions are not part of this language", tip: "grant them where the Environment is opened" },
        listing: { message: "the listing belongs to the built record, not the builder", tip: "call .build() and inspect the IR" },
      },
    },

    table: {
      parent: "program",
      opens: [name(), ref("table")],    // .table("monthly", "sales")
      record: "calls",
      check(record, ctx) {
        if (SQL.test(record.table))
          ctx.error("W010", `table "${record.name}" got a string that reads as SQL; the language does not take SQL text`, {
            arg: 1, tip: "build the query with table methods: .join, .groupBy, .agg, .sort, .limit",
          });
        const calls = record.calls ?? [];
        calls.forEach((c, i) => {
          if (c.slot === "groupBy" && calls[i + 1]?.slot !== "agg")
            ctx.error("W004", "groupBy must be followed by .agg", { tip: "add .agg(name, type, g => …), or use .keepGroups to keep rows" });
        });
      },
      slots: {
        rename: { kind: "decl", args: [arg(recordOf("string"))], check: ({ args }, ctx) => checkColumns(Object.keys(args[0]), ctx) },
        cast: { kind: "decl", args: [arg(recordOf(COLUMN_TYPE))], check: ({ args }, ctx) => checkColumns(Object.keys(args[0]), ctx) },
        trim: { kind: "decl", args: [rest(arg("string"))], ...columnsArg },
        replace: { kind: "decl", args: [arg("string"), arg(recordOf("string"))], check: ({ args }, ctx) => checkColumns([args[0]], ctx) },
        dropNulls: { kind: "decl", args: [arg("string[]")], check: ({ args }, ctx) => checkColumns(args[0], ctx) },
        dedupe: { kind: "decl", args: [arg("string[]")], check: ({ args }, ctx) => checkColumns(args[0], ctx) },
        select: { kind: "decl", args: [rest(arg("string"))], ...columnsArg },
        sort: { kind: "decl", args: [rest(arg("string"))], ...columnsArg },   // "-total" sorts descending
        limit: {
          kind: "decl", args: [arg(oneOf("number", { param: "string" }))],
          check({ args: [n] }, ctx) {
            if (typeof n === "object" && !(n.param in (ctx.program.params ?? {})))
              ctx.error("W005", `no param "${n.param}"`, { arg: 0, suggest: Object.keys(ctx.program.params ?? {}) });
          },
        },
        groupBy: { kind: "decl", args: [rest(arg("string"))], ...columnsArg },
        join: {
          kind: "decl",
          args: [ref("table"), arg({ on: oneOf("string", recordOf("string")), "take?": "string[]" })],
        },
        semiJoin: { kind: "decl", args: [ref("table"), arg({ on: "string" })] },
        describe: { kind: "decl", args: [], once: true },
        winsorize: { kind: "decl", args: [arg("string"), arg({ "lo?": "number", "hi?": "number" })] },
        zscore: { kind: "decl", args: [arg("string")] },
        column: {
          kind: "decl",
          args: [arg("string"), arg({ "unit?": "string", "currency?": enumOf(["USD", "EUR", "GBP"]) })],
          check: ({ args }, ctx) => checkColumns([args[0]], ctx),
        },
        derive: { kind: "lambda", slot: "derive", args: [arg("string"), arg(COLUMN_TYPE)] },  // .derive("revenue", "f64", row => …)
        filter: { kind: "lambda", slot: "filter" },
        agg: { kind: "lambda", slot: "agg", args: [arg("string"), arg(COLUMN_TYPE)] },         // .agg("total", "f64", g => …)
        keepGroups: { kind: "lambda", slot: "keepGroups", args: [arg("string")] },
        pivot: {
          kind: "lambda", slot: "pivot",
          args: [arg({ rows: "string", cols: "string", expect: "string[]" })],
        },
      },
    },

    chart: {
      parent: "program",
      opens: [name(), ref("table"), arg(enumOf(["line", "bar", "histogram", "heatmap", "point"]))],
      slots: {
        x: { kind: "decl", args: [arg(Encoding)], once: true },
        y: { kind: "decl", args: [arg(Encoding)], once: true },
        color: { kind: "decl", args: [arg(Encoding)], once: true },
        tooltip: { kind: "decl", args: [rest(arg("string"))], once: true },
        rule: { kind: "decl", args: [arg("number"), arg({ "label?": "string" })] },
        title: { kind: "lambda", slot: "text", once: true },                                  // .title(() => …)
        format: { kind: "lambda", slot: "text", args: [arg(enumOf(["x", "y", "color"]))] },   // .format("y", () => …)
      },
    },
  },
});
