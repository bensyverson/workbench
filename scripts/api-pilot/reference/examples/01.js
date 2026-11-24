// Three accounts, a transfer to an account declared later and one declared earlier, every Math method,
// month comparisons with < and <=, m.year and m.month, a top-level constant, and no horizon.
import { budget } from "../budget.grammar.js";

const RAISE = 1.03;
const BONUS_MONTH = 12;

export default ($) => budget("three-pots")
  .param("pay", { value: 3800, min: 0, max: 20000 })
  .param("floor", { value: 500, min: 0, max: 5000 })
  .start(2026, 4)
  .account("checking", { opening: 2500 })
    .inflow("pay", (m) => (m.year > 2026 ? $.pay * RAISE : $.pay))
    .inflow("bonus", (m) => (m.month === BONUS_MONTH ? Math.round($.pay * 0.5) : 0))
    .outflow("bills", (m) => Math.max(1200, 1100 + m.index * 5, 1150))
    .outflow("fun", (m, f) => Math.min(400, Math.abs(f.pay - f.bills) * 0.1))
    .transfer("emergency", (m, f, balance) => Math.max(0, balance - $.floor) * 0.2)
    .transfer("holiday", (m) => (m.date < monthOf(2026, 12) ? 150 : 0))
  .account("emergency", { opening: 1000 })
    .inflow("interest", (m, f, balance) => balance * 0.002)
  .account("holiday", { opening: 0 })
    .outflow("flights", (m) => (m.date <= monthOf(2026, 8) && m.date >= monthOf(2026, 8) ? 900 : 0))
    .transfer("checking", (m, f, balance) => (m.month === 12 ? balance : 0));
