import { defineDialect, scalar, exact, object } from "kit/define";

// Group members for agg: sum over numeric columns, min and max over ordered ones.
function groupMembers(columns) {
  const numeric = {};
  const ordered = {};
  for (const [name, type] of Object.entries(columns)) {
    if (type === "f64") numeric[name] = { params: [], returns: "f64" };
    if (type === "f64" || type === "date") ordered[name] = { params: [], returns: type };
  }
  return {
    sum: { keyed: { what: "column", keys: numeric } },
    min: { keyed: { what: "column", keys: ordered } },
    max: { keyed: { what: "column", keys: ordered } },
    count: { fn: { params: [], returns: "f64" } },
  };
}

// A row lambda sees the table's columns as they stand before its call.
const rowSlot = (returns) => (ref, program, state) => ({
  params: [object(`a row of ${ref.on}`, state?.columns ?? {})],
  returns,
  space: "row",
});

export const data = defineDialect({
  name: "data",
  numberType: "f64",
  types: {
    date: scalar("f64", { note: "milliseconds since 1970-01-01, UTC" }),
  },
  spaces: {
    row: { pure: true },
    group: { pure: true },
    value: { pure: true },
  },
  objects: {
    Params: { label: "the params ($)", members: {} },
  },
  globals: { $: "Params" },
  intrinsics: {
    year: {
      params: ["date"], returns: "f64",
      ref: (ms) => new Date(ms).getUTCFullYear(),
      spell: { js: { call: "yearOf($0)", prelude: "const yearOf = (ms) => new Date(ms).getUTCFullYear();" } },
    },
    month: {
      params: ["date"], returns: "f64",
      ref: (ms) => new Date(ms).getUTCMonth() + 1,
      spell: { js: { call: "monthOf($0)", prelude: "const monthOf = (ms) => new Date(ms).getUTCMonth() + 1;" } },
    },
    truncMonth: {
      params: ["date"], returns: "date",
      ref: (ms) => {
        const d = new Date(ms);
        return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
      },
      spell: {
        js: {
          call: "truncMonthOf($0)",
          prelude: "const truncMonthOf = (ms) => { const d = new Date(ms); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1); };",
        },
      },
    },
  },
  targets: {
    js: { accepts: "*", compare: exact() },
  },
  slots: {
    where: rowSlot("bool"),
    derive: rowSlot("infer"),
    group: (ref, program, state) => ({
      params: [object(`a group of ${ref.on}`, groupMembers(state?.columns ?? {}))],
      returns: "infer",
      space: "group",
    }),
    value: { params: [], returns: "f64", space: "value" },
  },

  // Each param is a member of $, read in a lambda as $.name.
  environment(program) {
    const members = {};
    for (const [n, p] of Object.entries(program.params ?? {})) {
      if ("date" in p) members[n] = "date";
      else if (typeof p.value === "boolean") members[n] = "bool";
      else if (typeof p.value === "string") members[n] = "str";
      else members[n] = "f64";
    }
    return { objects: { Params: { members } } };
  },
});
