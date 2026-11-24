import { budget } from "../budget.grammar.js";

const capped = (x) => Math.max(0, Math.min(x, 500));
const after = (m, y, mo) => (m.date >= monthOf(y, mo) ? 1 : 0);
const KIDS = ["ana", "ben"];

export default ($) => {
  let b = budget("family")
    .param("allowance", { value: 20, min: 0, max: 100 })
    .param("extra", { value: 1, min: 0, max: 1 })
    .start(2025, 9)
    .horizon(24)
    .account("main", { opening: 3000 })
      .inflow("pay", (m) => (m.month === 12 ? 6000 : 4500))
      .outflow("bills", (m, f) => Math.round(f.pay * 0.3))
      .outflow("car", (m) => 300 * after(m, 2026, 3));
  for (const kid of KIDS) {
    b = b.transfer(kid, (m, f, balance) => capped($.allowance + Math.abs(balance) * 0));
  }
  if ($.extra > 0) b = b.outflow("gifts", (m) => (m.month === 12 ? 400 : 0));
  for (const kid of KIDS) b = b.account(kid, { opening: 0 });
  return b.account("empty", { opening: 0 });
};
