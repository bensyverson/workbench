// The budget planner Dialect: a household budget planned month by month. Every lambda gives one month's amount
// (an f64) and runs in the pure `month` space; it reads the month (m), the amounts of the flows declared earlier
// in its account (f, typed from the account's construct state in budget.grammar.js) and the account's opening
// balance for that month. A month is a nominal scalar, `month`, made inside a lambda by monthOf(year, month).

import { defineDialect, scalar, exact, object } from "kit/define";

/** A month as a number: year * 12 + (month - 1), so consecutive months differ by 1 and compare in order. */
const monthValue = (y, m) => y * 12 + (m - 1);

/** "2026-01" from a month value. */
export const monthLabel = (v) => `${Math.floor(v / 12)}-${String((v % 12) + 1).padStart(2, "0")}`;

/**
 * A flow's or a transfer's convention: (m, f, balance) => amount. `f` holds the flows the account declared
 * before this call, which the account's state carries (budget.grammar.js).
 */
const flow = (ref, _program, state) => ({
  params: ["Month", object(`the flows before this one in '${ref.on}' (f)`, state?.flows ?? {}), "f64"],
  returns: "f64",
  space: "month",
});

/** One Math method on numbers: `n` arguments, or two and more with `rest`. */
const mathFn = (n, rest) => ({ fn: { params: Array(n).fill("f64"), returns: "f64", ...(rest ? { rest: "f64" } : {}) } });

/**
 * The text view. Its state is the ledger a host computed by running the Program:
 *   { accounts: string[], rows: Array<{ month: number, closing: number[] }> }
 * `month` a month value (year * 12 + month - 1), `closing` each account's closing balance in `accounts` order.
 * It prints a header, then one row per month: the month as 2026-01 and each balance to the cent.
 */
function ledgerText(ledger) {
  const header = ["month", ...ledger.accounts];
  const rows = ledger.rows.map((r) => [monthLabel(r.month), ...r.closing.map((b) => b.toFixed(2))]);
  const width = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (cells) => cells.map((c, i) => (i === 0 ? c.padEnd(width[i]) : c.padStart(width[i]))).join("  ");
  return [line(header), ...rows.map(line)].join("\n");
}

export const budgetDialect = defineDialect({
  name: "budget",
  numberType: "f64",
  types: {
    month: scalar("f64", { note: "a calendar month: year * 12 + (month - 1)" }),
  },
  spaces: { month: { pure: true } },
  objects: {
    Month: { label: "the month (m)", members: { index: "f64", year: "f64", month: "f64", date: "month" } },
    Params: { label: "the params ($)", members: {} },
    Math: { label: "Math", members: { min: mathFn(2, true), max: mathFn(2, true), round: mathFn(1), abs: mathFn(1) } },
  },
  globals: { $: "Params", Math: "Math" },
  params: { object: "Params", name: "$" },
  intrinsics: {
    monthOf: {
      params: ["f64", "f64"], returns: "month",
      ref: monthValue,
      spell: { js: "(($0) * 12 + ($1) - 1)" },
    },
  },
  targets: { js: { accepts: "*", compare: exact() } },
  slots: { flow },
  // Each param is a number, read in a lambda as $.name.
  environment(program) {
    const members = {};
    for (const n of Object.keys(program.params ?? {})) members[n] = "f64";
    return { objects: { Params: { members } } };
  },
  text: ledgerText,
});
