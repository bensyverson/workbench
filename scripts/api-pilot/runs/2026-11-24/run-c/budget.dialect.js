import { defineDialect, scalar, object, exact } from "kit/define";

// A month is a number of months since year 0, so monthOf(y, m) is a plain
// number at run time. The type is nominal: it compares with months only.
const flowConvention = (ref, program, state) => ({
  params: ["Month", object(`the flows declared before ${ref.on}`, state.flows), "f64"],
  returns: "f64",
  space: "row",
});

export const budgetLang = defineDialect({
  name: "budget",
  numberType: "f64",
  types: {
    month: scalar("f64", { note: "a calendar month, as months since year 0" }),
  },
  spaces: { row: { pure: true } },
  objects: {
    Math: {
      label: "Math",
      members: {
        min: { fn: { params: ["f64", "f64"], rest: "f64", returns: "f64" } },
        max: { fn: { params: ["f64", "f64"], rest: "f64", returns: "f64" } },
        round: { fn: { params: ["f64"], returns: "f64" } },
        abs: { fn: { params: ["f64"], returns: "f64" } },
      },
    },
    Month: {
      label: "the month (m)",
      members: { index: "f64", year: "f64", month: "f64", date: "month" },
    },
    Params: { label: "the params ($)", members: {} },
  },
  globals: { Math: "Math", $: "Params" },
  intrinsics: {
    monthOf: {
      params: ["f64", "f64"],
      returns: "month",
      ref: (y, m) => y * 12 + (m - 1),
      spell: {
        js: {
          call: "monthOf($0, $1)",
          prelude: "const monthOf = (y, m) => y * 12 + (m - 1);",
        },
      },
    },
  },
  targets: { js: { accepts: "*", compare: exact() } },
  slots: {
    flow: flowConvention,
    transfer: flowConvention,
  },
  params: { object: "Params", name: "$" },
  environment(program) {
    const members = {};
    for (const n of Object.keys(program.params ?? {})) members[n] = "f64";
    return { objects: { Params: { members } } };
  },
  // The state is the host's computed ledger: { accounts: string[], rows: { year, month, balances: number[] }[] }.
  text(state) {
    const lines = [["month", ...state.accounts].join("  ")];
    for (const r of state.rows) {
      const mm = String(r.month).padStart(2, "0");
      lines.push([`${r.year}-${mm}`, ...r.balances.map(String)].join("  "));
    }
    return lines.join("\n");
  },
});
