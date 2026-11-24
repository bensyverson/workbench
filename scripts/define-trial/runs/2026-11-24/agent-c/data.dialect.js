import { defineDialect, exact } from "kit/define";

const num = (name, ref, js) => ({ params: ["f64"], returns: "f64", ref, spell: { js } });

export const data = defineDialect({
  name: "data",
  numberType: "f64",
  spaces: { row: { pure: true }, group: { pure: true } },
  objects: {
    // one Row for every table: the draft gives no per-table object (see REPORT)
    Row: { label: "the row", members: {} },
    Params: { label: "the params ($)", members: {} },
    Group: {
      label: "the group (g)",
      members: {
        count: { fn: { params: [], returns: "f64" } },
        sum: { keyed: { what: "column", keys: { _: { params: [], returns: "f64" } } } },
        min: { keyed: { what: "column", keys: { _: { params: [], returns: "f64" } } } },
        max: { keyed: { what: "column", keys: { _: { params: [], returns: "f64" } } } },
        mean: { keyed: { what: "column", keys: { _: { params: [], returns: "f64" } } } },
        countDistinct: { keyed: { what: "column", keys: { _: { params: [], returns: "f64" } } } },
      },
    },
  },
  globals: { $: "Params" },
  intrinsics: {
    abs: num("abs", Math.abs, "Math.abs($0)"),
    floor: num("floor", Math.floor, "Math.floor($0)"),
    sqrt: num("sqrt", Math.sqrt, "Math.sqrt($0)"),
    min: { params: ["f64", "f64"], returns: "f64", ref: Math.min, spell: { js: "Math.min($0, $1)" } },
    max: { params: ["f64", "f64"], returns: "f64", ref: Math.max, spell: { js: "Math.max($0, $1)" } },
  },
  library: {
    clamp: { fn: "(x, lo, hi) => min(max(x, lo), hi)" },
  },
  targets: { js: { accepts: "*", compare: exact() } },
  slots: {
    row: { params: ["Row"], returns: "infer", space: "row" },
    predicate: { params: ["Row"], returns: "bool", space: "row" },
    group: { params: ["Group"], returns: "f64", space: "group" },
    groupTest: { params: ["Group"], returns: "bool", space: "group" },
  },
  environment(program) {
    const row = {};
    const params = {};
    for (const [n, p] of Object.entries(program.params ?? {})) {
      params[n] = typeof p.value === "boolean" ? "bool" : typeof p.value === "number" ? "f64" : "str";
    }
    for (const t of program.table ?? []) {
      for (const c of t.calls ?? []) {
        if (c.slot === "derive") row[c.args[0]] = "f64";
      }
    }
    return { objects: { Params: { members: params }, Row: { members: row } } };
  },
});
