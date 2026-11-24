import { defineGrammar, name, ref, data as dataSpec, oneOf, enumOf, rest, recordOf, listOf } from "kit/define";
import { data } from "./data.dialect.js";

const ParamShape = oneOf(
  { value: "number", "min?": "number", "max?": "number", "step?": "number", "label?": "string" },
  { value: "string", "options?": "string[]", "label?": "string" },
  { value: "boolean", "label?": "string" },
);
const CsvShape = { csv: "string", "header?": "boolean" };
const EncShape = { "type?": enumOf(["time", "ordinal", "number"]), "format?": "string", "sort?": "string", "scheme?": "string" };
const JoinShape = { on: recordOf("string"), "take?": "string[]" };

export const program = defineGrammar(data, {
  root: "program",
  constructs: {
    program: {
      opens: [name()],
      slots: {
        source: { kind: "decl", args: [name("table"), dataSpec(CsvShape)], as: "sources" },
        param: { kind: "decl", args: [name("param"), dataSpec(ParamShape)], as: "params" },
        view: { kind: "decl", args: [rest(ref("table"))], as: "views" },
        fn: { kind: "unit", unit: "fn" },
        const: { kind: "unit", unit: "const" },
      },
      rejected: {
        sql: { message: "SQL text is not an input language", tip: "build the query with table methods: .join, .groupBy, .agg" },
      },
    },
    table: {
      parent: "program",
      opens: [name("table"), ref("table")],
      record: "calls",
      slots: {
        rename: { kind: "decl", args: [dataSpec(recordOf("string"))] },
        cast: { kind: "decl", args: [dataSpec(recordOf("string"))] },
        trim: { kind: "decl", args: [rest(dataSpec("string"))] },
        replace: { kind: "decl", args: [dataSpec("string"), dataSpec(recordOf("string"))] },
        dropNulls: { kind: "decl", args: [dataSpec("string[]")] },
        dedupe: { kind: "decl", args: [dataSpec("string[]")] },
        groupBy: { kind: "decl", args: [rest(dataSpec("string"))] },
        sort: { kind: "decl", args: [rest(dataSpec("string"))] },
        limit: { kind: "decl", args: [dataSpec("number")] },
        join: { kind: "decl", args: [ref("table"), dataSpec(JoinShape)] },
        semiJoin: { kind: "decl", args: [ref("table"), dataSpec({ on: "string" })] },
        derive: { kind: "lambda", slot: "row", args: [name("column")] },
        filter: { kind: "lambda", slot: "predicate" },
        // one aggregate per call, named: .agg("total", g => g.sum("amount"))
        agg: { kind: "lambda", slot: "group", args: [name("column")] },
        keepGroups: { kind: "lambda", slot: "groupTest", args: [dataSpec("string")] },
      },
      rejected: {
        sql: { message: "SQL text is not an input language", tip: "build the query with table methods: .join, .groupBy, .agg" },
      },
    },
    chart: {
      parent: "program",
      opens: [name("chart"), ref("table")],
      record: "calls",
      slots: {
        kind: { kind: "decl", args: [dataSpec(enumOf(["line", "bar", "histogram", "heatmap"]))], once: true },
        x: { kind: "decl", args: [dataSpec("string"), dataSpec(EncShape)] },
        y: { kind: "decl", args: [dataSpec("string"), dataSpec(EncShape)] },
        color: { kind: "decl", args: [dataSpec("string"), dataSpec(EncShape)] },
        tooltip: { kind: "decl", args: [rest(dataSpec("string"))] },
        title: { kind: "decl", args: [dataSpec("string")] },
      },
    },
  },
});
