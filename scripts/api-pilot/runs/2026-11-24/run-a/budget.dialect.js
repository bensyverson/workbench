import { defineDialect, scalar, object, exact } from "kit/define";

/** The month record a flow lambda gets as its first parameter. */
const MONTH = object("the month (m)", {
  index: "f64",
  year: "f64",
  month: "f64",
  date: "month",
});

/** A flow or transfer lambda: (m, f, balance) => amount. `f` holds the flows declared earlier in this account. */
const flowConvention = (ref, program, state) => ({
  params: [MONTH, object(`the flows declared so far in account '${ref.on}' (f)`, state.flows), "f64"],
  returns: "f64",
  space: "month",
});

const num2 = { params: ["f64", "f64"], returns: "f64" };

export const budgetLang = defineDialect({
  name: "budget",
  numberType: "f64",
  types: {
    month: scalar("f64", { note: "months since year 0: year * 12 + (month - 1); compares only with months" }),
  },
  spaces: { month: { pure: true } },
  objects: {
    Math: { label: "Math", members: {
      min: { fn: { params: ["f64", "f64"], rest: "f64", returns: "f64" } },
      max: { fn: { params: ["f64", "f64"], rest: "f64", returns: "f64" } },
      round: { fn: { params: ["f64"], returns: "f64" } },
      abs: { fn: { params: ["f64"], returns: "f64" } },
    } },
    Params: { label: "the params ($)", members: {} },
  },
  globals: { Math: "Math", $: "Params" },
  intrinsics: {
    monthOf: {
      params: ["f64", "f64"], returns: "month",
      ref: (y, m) => y * 12 + (m - 1),
      spell: { js: { call: "monthOf($0, $1)", prelude: "const monthOf = (y, m) => y * 12 + (m - 1);" } },
    },
  },
  targets: { js: { accepts: "*", compare: exact() } },
  slots: {
    flow: flowConvention,
  },
  params: { object: "Params", name: "$" },
  environment(program) {
    const members = {};
    for (const n of Object.keys(program.params ?? {})) members[n] = "f64";
    return { objects: { Params: { members } } };
  },
  /**
   * `state` is the ledger the host computed:
   * { accounts: string[], rows: [{ year, month, balances: { [account]: number } }] }
   * (closing balance of each account per month).
   */
  text(state) {
    const accounts = state?.accounts ?? [];
    const rows = state?.rows ?? [];
    const pad = (s, n) => String(s).padStart(n);
    const widths = accounts.map((a) => Math.max(a.length, 10));
    const head = ["month  ", ...accounts.map((a, i) => pad(a, widths[i]))].join("  ");
    const lines = rows.map((r) => {
      const label = `${r.year}-${String(r.month).padStart(2, "0")}`;
      return [label, ...accounts.map((a, i) => pad((r.balances?.[a] ?? 0).toFixed(2), widths[i]))].join("  ");
    });
    return [head, ...lines].join("\n");
  },
});
