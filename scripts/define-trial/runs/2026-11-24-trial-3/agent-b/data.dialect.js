import { defineDialect, scalar, exact, object } from "kit/define";

// state of text(): one table, { name, columns: { column: type }, rows: [ { column: value } ] }
function tableText(table) {
  const names = Object.keys(table.columns);
  const head = names.map((c) => `${c}:${table.columns[c]}`).join(" | ");
  return [`${table.name}: ${table.rows.length} rows`, head, ...table.rows.slice(0, 20).map((r) => names.map((c) => String(r[c])).join(" | "))].join("\n");
}

const DATE_MS = "milliseconds since 1970-01-01, UTC";
const utc = (d) => new Date(d);

export const data = defineDialect({
  name: "data-tools",
  numberType: "f64",
  types: {
    date: scalar("f64", { note: DATE_MS }),
  },
  spaces: { row: { pure: true }, group: { pure: true } },
  objects: {
    Params: { label: "the params ($)", members: {} },
  },
  globals: { $: "Params" },
  params: { object: "Params", name: "$" },
  intrinsics: {
    year: {
      params: ["date"], returns: "f64",
      ref: (d) => utc(d).getUTCFullYear(),
      spell: { js: "new Date($0).getUTCFullYear()" },
    },
    month: {
      params: ["date"], returns: "f64",
      ref: (d) => utc(d).getUTCMonth() + 1,
      spell: { js: "(new Date($0).getUTCMonth() + 1)" },
    },
    truncMonth: {
      params: ["date"], returns: "date",
      ref: (d) => Date.UTC(utc(d).getUTCFullYear(), utc(d).getUTCMonth(), 1),
      spell: { js: "Date.UTC(new Date($0).getUTCFullYear(), new Date($0).getUTCMonth(), 1)" },
    },
    abs: { params: ["f64"], returns: "f64", ref: Math.abs, spell: { js: "Math.abs($0)" } },
    min: { params: ["f64", "f64"], returns: "f64", ref: Math.min, spell: { js: "Math.min($0, $1)" } },
    max: { params: ["f64", "f64"], returns: "f64", ref: Math.max, spell: { js: "Math.max($0, $1)" } },
  },
  library: {},
  targets: { js: { accepts: "*", compare: exact() } },
  slots: {
    // a row, typed by the table as it stands at this step
    row: (ref, program, state) => ({ params: [object(`a row of ${ref.on}`, state.columns)], returns: "infer", space: "row" }),
    rowTest: (ref, program, state) => ({ params: [object(`a row of ${ref.on}`, state.columns)], returns: "bool", space: "row" }),
    group: (ref, program, state) => ({ params: [object(`a group of ${ref.on}`, groupMembers(state.columns))], returns: "infer", space: "group" }),
    groupTest: (ref, program, state) => ({ params: [object(`a group of ${ref.on}`, groupMembers(state.columns))], returns: "bool", space: "group" }),
  },
  environment(program) {
    const members = {};
    for (const [n, p] of Object.entries(program.param ?? {})) {
      members[n] = p.type === "date" ? "date" : typeof p.value === "number" ? "f64" : typeof p.value === "boolean" ? "bool" : "str";
    }
    return { objects: { Params: { members } } };
  },
  text: tableText,
});

function groupMembers(columns) {
  const num = {}, ord = {}, all = {};
  for (const [c, t] of Object.entries(columns)) {
    all[c] = { params: [], returns: "f64" };
    if (t === "f64") { num[c] = { params: [], returns: "f64" }; ord[c] = { params: [], returns: "f64" }; }
    if (t === "date") ord[c] = { params: [], returns: "date" };
  }
  return {
    count: { fn: { params: [], returns: "f64" } },
    sum: { keyed: { what: "column", keys: num } },
    mean: { keyed: { what: "column", keys: num } },
    min: { keyed: { what: "column", keys: ord } },
    max: { keyed: { what: "column", keys: ord } },
    countDistinct: { keyed: { what: "column", keys: all } },
  };
}
