import { budget } from "../budget.grammar.js";

export default ($) => budget("maths")
  .param("cap", { value: 800, min: 0, max: 5000 })
  .start(2026, 1)
  .horizon(12)
  .account("main", { opening: 1000 })
    .inflow("pay", (m) => Math.round(3000.4 + m.index * 10.6))
    .outflow("a", (m, f) => Math.min(f.pay * 0.5, $.cap))
    .outflow("b", (m, f) => Math.max(100, f.pay * 0.1))
    .outflow("c", (m, f, balance) => Math.abs(balance) * 0.01);
