import { defineDialect, scalar, exact, object } from "kit/define";

const COLUMN_TYPES = ["f64", "str", "date", "bool"];

// A table's columns as lambda members: name -> type name.
const columnsOf = (state) => ({ ...state.columns });

// Keyed aggregate members over a table's columns, filtered by type.
function keyed(columns, wanted, signature) {
  const keys = {};
  for (const [c, t] of Object.entries(columns)) {
    if (wanted && !wanted.includes(t)) continue;
    keys[c] = signature(t);
  }
  return { keyed: { what: "column", keys } };
}

function groupOf(state, label) {
  const cols = state.columns;
  return object(label, {
    count: { fn: { params: [], returns: "f64" } },
    sum: keyed(cols, ["f64"], () => ({ params: [], returns: "f64" })),
    mean: keyed(cols, ["f64"], () => ({ params: [], returns: "f64" })),
    min: keyed(cols, ["f64", "date"], (t) => ({ params: [], returns: t })),
    max: keyed(cols, ["f64", "date"], (t) => ({ params: [], returns: t })),
    countDistinct: keyed(cols, null, () => ({ params: [], returns: "f64" })),
  });
}

function statsOf(state, label) {
  const cols = state.columns;
  return object(label, {
    mean: keyed(cols, ["f64"], () => ({ params: [], returns: "f64" })),
    sd: keyed(cols, ["f64"], () => ({ params: [], returns: "f64" })),
    quantile: keyed(cols, ["f64"], () => ({ params: ["f64"], returns: "f64" })),
  });
}

const need = (state, ref) => (state ? null : `no table state for ${ref.on}`);

export const data = defineDialect({
  name: "data",
  numberType: "f64",
  types: {
    date: scalar("f64", { note: "milliseconds since 1970-01-01, UTC" }),
  },
  spaces: { row: { pure: true }, group: { pure: true }, scalar: { pure: true } },
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
    truncMonth: {
      params: ["date"], returns: "date",
      ref: (d) => Date.UTC(new Date(d).getUTCFullYear(), new Date(d).getUTCMonth(), 1),
      spell: { js: "Date.UTC(new Date($0).getUTCFullYear(), new Date($0).getUTCMonth(), 1)" },
    },
    min: { params: ["f64", "f64"], returns: "f64", ref: Math.min, spell: { js: "Math.min($0, $1)" } },
    max: { params: ["f64", "f64"], returns: "f64", ref: Math.max, spell: { js: "Math.max($0, $1)" } },
  },
  targets: { js: { accepts: "*", compare: exact() } },
  slots: {
    row: (ref, program, state) =>
      need(state, ref) ?? { params: [object(`a row of ${ref.on}`, columnsOf(state))], returns: "infer", space: "row" },
    pred: (ref, program, state) =>
      need(state, ref) ?? { params: [object(`a row of ${ref.on}`, columnsOf(state))], returns: "bool", space: "row" },
    derive: (ref, program, state) =>
      need(state, ref) ?? {
        params: [object(`a row of ${ref.on}`, columnsOf(state)), statsOf(state, `the column stats of ${ref.on}`)],
        returns: "infer", space: "row",
      },
    group: (ref, program, state) =>
      need(state, ref) ?? { params: [groupOf(state, `a group of ${ref.on}`)], returns: "infer", space: "group" },
    groupPred: (ref, program, state) =>
      need(state, ref) ?? { params: [groupOf(state, `a group of ${ref.on}`)], returns: "bool", space: "group" },
    scalar: { params: [], returns: "infer", space: "scalar" },
  },
  // Each param becomes a member of $.
  environment(program) {
    const members = {};
    for (const [n, p] of Object.entries(program.params ?? {})) {
      members[n] = p.isDate ? "date" : typeof p.value === "number" ? "f64" : typeof p.value === "boolean" ? "bool" : "str";
    }
    return { objects: { Params: { members } } };
  },
});
