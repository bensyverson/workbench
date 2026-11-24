import { budget } from "../budget.grammar.js";

const rates = { low: 0.02, high: 0.05 };
const bonusMonths = 3;
const base = 2500;

export default ($) => budget("constants")
  .start(2026, 1)
  .horizon(12)
  .account("main", { opening: 300 })
    .inflow("pay", (m) => base + (m.index < bonusMonths ? 500 : 0))
    .outflow("tax", (m, f) => f.pay * rates.low)
    .outflow("levy", (m, f) => f.pay * rates.high);
