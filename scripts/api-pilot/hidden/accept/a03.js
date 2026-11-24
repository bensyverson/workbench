import { budget } from "../budget.grammar.js";

export default ($) => budget("flows")
  .start(2027, 3)
  .horizon(24)
  .account("main", { opening: 500 })
    .inflow("pay", () => 3000)
    .inflow("bonus", (m) => (m.index === 5 ? 1000 : 0))
    .outflow("bills", (m, f) => f.pay * 0.4)
    .outflow("extra", (m, f, balance) => (balance > 5000 ? 200 : 0))
    .outflow("fee", (m, f, balance) => balance * 0.001 + f.bills - f.bills);
