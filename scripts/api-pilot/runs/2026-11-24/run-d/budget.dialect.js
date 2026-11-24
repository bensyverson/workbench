import { defineDialect, scalar, object, exact } from "kit/define";

// The state a flow or transfer lambda sees is the account's state at lowering:
// { flows: { name: "f64" } }, the inflows and outflows declared earlier in it.
export const budgetLang = defineDialect({
  name: "budget",
  numberType: "f64",
  types: {
    month: scalar("f64", { note: "a month: year * 12 + (month - 1)" }),
  },
  spaces: { month: { pure: true } },
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
      ref: (year, month) => year * 12 + (month - 1),
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
    flow: (ref, program, state) => ({
      params: ["Month", object(`the flows of ${ref.on} before this one`, state.flows), "f64"],
      returns: "f64",
      space: "month",
    }),
    transfer: (ref, program, state) => ({
      params: ["Month", object(`the flows of ${ref.on} before this one`, state.flows)],
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
  // The host passes state = { accounts: [name], months: [{ date: "2026-01", balances: { name: number } }] }.
  text(state) {
    const names = state.accounts;
    const head = ["month", ...names].join("  ");
    const rows = state.months.map((r) =>
      [r.date, ...names.map((n) => r.balances[n].toFixed(2))].join("  "),
    );
    return [head, ...rows].join("\n");
  },
});
