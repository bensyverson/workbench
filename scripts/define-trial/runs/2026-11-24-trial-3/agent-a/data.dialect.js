import { defineDialect, scalar, exact, object } from "kit/define";

const keysOf = (cols, returns) => Object.fromEntries(cols.map(([c, t]) => [c, { params: [], returns: returns ?? t }]));

const groupMembers = (columns) => {
  const all = Object.entries(columns);
  const num = all.filter(([, t]) => t === "f64");
  const ordered = all.filter(([, t]) => t === "f64" || t === "date");
  const members = {
    count: { fn: { params: [], returns: "f64" } },
    countDistinct: { keyed: { what: "column", keys: keysOf(all, "f64") } },
  };
  if (num.length) {
    members.sum = { keyed: { what: "column", keys: keysOf(num, "f64") } };
    members.mean = { keyed: { what: "column", keys: keysOf(num, "f64") } };
    members.sd = { keyed: { what: "column", keys: keysOf(num, "f64") } };
    members.quantile = { keyed: { what: "column", keys: Object.fromEntries(num.map(([c]) => [c, { params: ["f64"], returns: "f64" }])) } };
  }
  if (ordered.length) {
    members.min = { keyed: { what: "column", keys: keysOf(ordered) } };
    members.max = { keyed: { what: "column", keys: keysOf(ordered) } };
  }
  return members;
};

const utc = (d) => new Date(d);
const truncMonthRef = (d) => { const x = utc(d); return Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), 1); };
const truncWeekRef = (d) => { const day = 86400000; const x = Math.floor(d / day); return (x - ((x + 3) % 7)) * day; };
const monthsBetweenRef = (a, b) => { const x = utc(a), y = utc(b); return (y.getUTCFullYear() - x.getUTCFullYear()) * 12 + y.getUTCMonth() - x.getUTCMonth(); };
const weeksBetweenRef = (a, b) => Math.floor((b - a) / 604800000);

export const data = defineDialect({
  name: "data",
  numberType: "f64",
  types: {
    date: scalar("f64", { note: "milliseconds since 1970-01-01, UTC" }),
  },
  spaces: {
    row: { pure: true },     // per row of a table
    group: { pure: true },   // per group of a grouped table
    chart: { pure: true },   // once per chart render: encodings and titles that follow params
  },
  objects: {
    Params: { label: "the params ($)", members: {} },
  },
  globals: { $: "Params" },
  params: { object: "Params", name: "$" },
  intrinsics: {
    year: { params: ["date"], returns: "f64", ref: (d) => utc(d).getUTCFullYear(),
      spell: { js: "new Date($0).getUTCFullYear()" } },
    month: { params: ["date"], returns: "f64", ref: (d) => utc(d).getUTCMonth() + 1,
      spell: { js: "(new Date($0).getUTCMonth() + 1)" } },
    truncMonth: { params: ["date"], returns: "date", ref: truncMonthRef,
      spell: { js: { call: "truncMonth($0)", prelude: "const truncMonth = (d) => { const x = new Date(d); return Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), 1); };" } } },
    truncWeek: { params: ["date"], returns: "date", ref: truncWeekRef,
      spell: { js: { call: "truncWeek($0)", prelude: "const truncWeek = (d) => { const day = 86400000; const x = Math.floor(d / day); return (x - ((x + 3) % 7)) * day; };" } } },
    monthsBetween: { params: ["date", "date"], returns: "f64", ref: monthsBetweenRef,
      spell: { js: { call: "monthsBetween($0, $1)", prelude: "const monthsBetween = (a, b) => { const x = new Date(a), y = new Date(b); return (y.getUTCFullYear() - x.getUTCFullYear()) * 12 + y.getUTCMonth() - x.getUTCMonth(); };" } } },
    weeksBetween: { params: ["date", "date"], returns: "f64", ref: weeksBetweenRef,
      spell: { js: { call: "weeksBetween($0, $1)", prelude: "const weeksBetween = (a, b) => Math.floor((b - a) / 604800000);" } } },
    min: { params: ["f64", "f64"], returns: "f64", ref: Math.min, spell: { js: "Math.min($0, $1)" } },
    max: { params: ["f64", "f64"], returns: "f64", ref: Math.max, spell: { js: "Math.max($0, $1)" } },
    abs: { params: ["f64"], returns: "f64", ref: Math.abs, spell: { js: "Math.abs($0)" } },
  },
  targets: {
    js: { accepts: "*", compare: exact() },
  },
  slots: {
    // derive: any value of the row
    row: (ref, program, state) => ({ params: [object(`a row of ${ref.on}`, state.columns)], returns: "infer", space: "row" }),
    // filter: a row predicate
    pred: (ref, program, state) => ({ params: [object(`a row of ${ref.on}`, state.columns)], returns: "bool", space: "row" }),
    // agg: one value per group
    group: (ref, program, state) => ({ params: [object(`a group of ${ref.on}`, groupMembers(state.columns))], returns: "infer", space: "group" }),
    // keepGroups: a group predicate
    gpred: (ref, program, state) => ({ params: [object(`a group of ${ref.on}`, groupMembers(state.columns))], returns: "bool", space: "group" }),
    // a chart's text that follows the params: a column name, a title
    text: { params: [], returns: "str", space: "chart" },
  },
  environment(program) {
    const members = {};
    for (const [n, p] of Object.entries(program.params ?? {})) {
      members[n] = p.widget === "date" ? "date" : typeof p.value === "number" ? "f64" : typeof p.value === "boolean" ? "bool" : "str";
    }
    return { objects: { Params: { members } } };
  },
  // state: one table, { name, columns: { col: type }, rows: [{ col: value }] }
  text(table) {
    const names = Object.keys(table.columns);
    const show = (v, t) => (t === "date" && typeof v === "number" ? new Date(v).toISOString().slice(0, 10) : String(v));
    return [
      `${table.name}: ${table.rows.length} rows`,
      names.map((c) => `${c}:${table.columns[c]}`).join(" | "),
      ...table.rows.slice(0, 20).map((r) => names.map((c) => show(r[c], table.columns[c])).join(" | ")),
    ].join("\n");
  },
});

