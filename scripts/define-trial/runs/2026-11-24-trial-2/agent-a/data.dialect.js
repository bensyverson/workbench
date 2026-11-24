import { defineDialect, scalar, exact, object, enumOf } from "kit/define";

const dayMs = 86400000;
const monthStart = (d) => { const x = new Date(d); return Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), 1); };
const monthIndex = (d) => { const x = new Date(d); return x.getUTCFullYear() * 12 + x.getUTCMonth(); };

const columnsOf = (state) => state?.columns ?? {};
const rowOf = (returns, space) => (ref, program, state) => ({
  params: [object(`a row of ${ref.on}`, columnsOf(state))],
  returns,
  space,
});

// One aggregate object per call, typed by the columns at that step.
const groupOf = (returns) => (ref, program, state) => {
  const columns = columnsOf(state);
  const numeric = {}, every = {};
  for (const [c, t] of Object.entries(columns)) {
    every[c] = { params: [], returns: t };
    if (t === "f64") numeric[c] = { params: [], returns: "f64" };
  }
  const sameType = {};
  for (const [c, t] of Object.entries(columns)) sameType[c] = { params: [], returns: t };
  const members = {
    count: { fn: { params: [], returns: "f64" } },
    sum: { keyed: { what: "numeric column", keys: numeric } },
    mean: { keyed: { what: "numeric column", keys: numeric } },
    min: { keyed: { what: "column", keys: sameType } },
    max: { keyed: { what: "column", keys: sameType } },
    countDistinct: { keyed: { what: "column", keys: Object.fromEntries(Object.keys(columns).map((c) => [c, { params: [], returns: "f64" }])) } },
  };
  return { params: [object(`a group of ${ref.on}`, members)], returns, space: "group" };
};

export const data = defineDialect({
  name: "data",
  numberType: "f64",
  types: {
    date: scalar("f64", { note: "milliseconds since 1970-01-01, UTC" }),
  },
  spaces: { row: { pure: true }, group: { pure: true }, calc: { pure: true } },
  objects: {
    Params: { label: "the params ($)", members: {} },
  },
  globals: { $: "Params" },
  intrinsics: {
    year: {
      params: ["date"], returns: "f64",
      ref: (d) => new Date(d).getUTCFullYear(),
      spell: { js: "new Date($0).getUTCFullYear()" },
    },
    month: {
      params: ["date"], returns: "f64",
      ref: (d) => new Date(d).getUTCMonth() + 1,
      spell: { js: "(new Date($0).getUTCMonth() + 1)" },
    },
    truncMonth: {
      params: ["date"], returns: "date",
      ref: monthStart,
      spell: { js: { call: "truncMonth($0)", prelude: "const truncMonth = (d) => { const x = new Date(d); return Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), 1); };" } },
    },
    monthDiff: {
      params: ["date", "date"], returns: "f64",
      ref: (a, b) => monthIndex(b) - monthIndex(a),
      spell: { js: { call: "monthDiff($0, $1)", prelude: "const monthDiff = (a, b) => { const i = (d) => { const x = new Date(d); return x.getUTCFullYear() * 12 + x.getUTCMonth(); }; return i(b) - i(a); };" } },
    },
    min: { params: ["f64", "f64"], returns: "f64", ref: Math.min, spell: { js: "Math.min($0, $1)" } },
    max: { params: ["f64", "f64"], returns: "f64", ref: Math.max, spell: { js: "Math.max($0, $1)" } },
    abs: { params: ["f64"], returns: "f64", ref: Math.abs, spell: { js: "Math.abs($0)" } },
    round: { params: ["f64"], returns: "f64", ref: Math.round, spell: { js: "Math.round($0)" } },
  },
  targets: { js: { accepts: "*", compare: exact() } },
  slots: {
    row: rowOf("infer", "row"),
    pred: rowOf("bool", "row"),
    group: groupOf("infer"),
    groupPred: groupOf("bool"),
    calc: { params: [], returns: "infer", space: "calc" },
  },
  environment(program) {
    const members = {};
    for (const [n, p] of Object.entries(program.params ?? {})) {
      members[n] = typeof p.value === "number" ? "f64"
        : typeof p.value === "boolean" ? "bool"
        : p.kind === "date" ? "date" : "str";
    }
    return { objects: { Params: { members } } };
  },
});
