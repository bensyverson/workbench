import { defineDialect, scalar, exact, object } from "kit/define";

// A relation's state is { columns: { name: type }, keys: [name] }. Rows and groups are typed from it.
const groupMembers = (columns) => {
  const sum = {};
  for (const [c, t] of Object.entries(columns)) if (t === "f64") sum[c] = { params: [], returns: "f64" };
  return {
    sum: { keyed: { what: "column", keys: sum } },
    count: { fn: { params: [], returns: "f64" } },
  };
};

export const data = defineDialect({
  name: "data-tools",
  numberType: "f64",
  types: {
    date: scalar("f64", { note: "milliseconds since 1970-01-01, UTC" }),
  },
  spaces: { row: { pure: true }, group: { pure: true } },
  objects: {
    Params: { label: "the params ($)", members: {} },
  },
  globals: { $: "Params" },
  intrinsics: {
    year: {
      params: ["date"], returns: "f64", ref: (ms) => new Date(ms).getUTCFullYear(),
      spell: { js: "new Date($0).getUTCFullYear()" },
    },
    month: {
      params: ["date"], returns: "f64", ref: (ms) => new Date(ms).getUTCMonth() + 1,
      spell: { js: "(new Date($0).getUTCMonth() + 1)" },
    },
    truncMonth: {
      params: ["date"], returns: "date",
      ref: (ms) => { const d = new Date(ms); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1); },
      spell: {
        js: {
          call: "truncMonth($0)",
          prelude: "const truncMonth = (ms) => { const d = new Date(ms); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1); };",
        },
      },
    },
  },
  targets: {
    js: { accepts: ["row", "group"], compare: exact() },
  },
  slots: {
    row: (ref, program, state) => ({
      params: [object(`a row of ${ref.on}`, state.columns)], returns: "infer", space: "row",
    }),
    group: (ref, program, state) => ({
      params: [object(`a group of ${ref.on}`, groupMembers(state.columns))], returns: "infer", space: "group",
    }),
  },
  environment(program) {
    const members = {};
    for (const [n, p] of Object.entries(program.params ?? {})) {
      members[n] = typeof p.value === "string" ? "str"
        : typeof p.value === "boolean" ? "bool"
          : p.date === true ? "date" : "f64";
    }
    return { objects: { Params: { members } } };
  },
  text(state) {
    // The state of one relation: its columns and their types, one per line.
    return Object.entries(state.columns ?? {}).map(([c, t]) => `${c}: ${t}`).join("\n");
  },
});
