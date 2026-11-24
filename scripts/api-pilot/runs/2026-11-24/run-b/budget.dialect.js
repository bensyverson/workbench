import { defineDialect, scalar, exact, object } from "kit/define";

// state of an account construct: { flows: { [name]: "f64" } } (flows declared so far)
export const budgetLang = defineDialect({
  name: "budget",
  numberType: "f64",
  types: {
    month: scalar("f64", { note: "months since year 0" }),
  },
  spaces: { month: { pure: true } },
  objects: {
    Math: { label: "Math", members: {
      min: { fn: { params: ["f64", "f64"], rest: "f64", returns: "f64" } },
      max: { fn: { params: ["f64", "f64"], rest: "f64", returns: "f64" } },
      round: { fn: { params: ["f64"], returns: "f64" } },
      abs: { fn: { params: ["f64"], returns: "f64" } },
    } },
    Month: { label: "the month (m)", members: {
      index: "f64", year: "f64", month: "f64", date: "month",
    } },
    Params: { label: "the params ($)", members: {} },
  },
  globals: { Math: "Math", $: "Params" },
  intrinsics: {
    monthOf: { params: ["f64", "f64"], returns: "month",
      ref: (y, m) => y * 12 + (m - 1),
      spell: { js: { call: "monthOf($0, $1)", prelude: "const monthOf = (y, m) => y * 12 + (m - 1);" } } },
  },
  library: {},
  targets: { js: { accepts: "*", compare: exact() } },
  slots: {
    flow: (ref, program, state) => ({
      params: ["Month", object(`the flows of ${ref.on} so far`, state.flows), "f64"],
      returns: "f64",
      space: "month",
    }),
  },
  params: { object: "Params", name: "$" },
  environment(program) {
    const members = {};
    for (const n of Object.keys(program.params ?? {})) members[n] = "f64";
    return { objects: { Params: { members } } };
  },
  text(state) {
    // state: { rows: [{ month: "2026-01", balances: { [account]: number } }] }
    const rows = state?.rows ?? [];
    return rows.map((r) => `${r.month} ${Object.values(r.balances).join(" ")}`).join("\n");
  },
});
