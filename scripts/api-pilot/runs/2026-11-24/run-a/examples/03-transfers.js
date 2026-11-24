import { budget } from "../budget.grammar.js";

export default ($) => budget("two-way")
  .start(2027, 12)
  .account("a", { opening: 100 })
    .transfer("b", (m) => 10)
    .transfer("b", (m, f, balance) => (balance > 1000 ? 50 : 0))
    .inflow("side", (m) => (m.date < monthOf(2028, 6) && m.year >= 2027 ? 200 : 0))
  .account("b", { opening: 0 })
    .outflow("fee", (m) => 1)
    .transfer("a", (m, f) => f.fee * 2);
