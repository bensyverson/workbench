import { budget } from "../budget.grammar.js";

export default ($) => budget("chain")
  .start(2026, 1)
  .horizon(12)
  .account("checking", { opening: 1000 })
    .inflow("salary", (m) => 4000)
    .transfer("savings", (m, f) => f.salary * 0.2)
    .transfer("holiday", (m, f) => f.salary * 0.05)
  .account("savings", { opening: 0 })
    .transfer("checking", (m, f, balance) => (balance > 10000 ? 500 : 0))
  .account("holiday", { opening: 50 })
    .outflow("trip", (m) => (m.month === 8 ? 1200 : 0));
