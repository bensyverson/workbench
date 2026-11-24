import { budget } from "../budget.grammar.js";
export default ($) => budget("b").start(2026, 1)
  .account("a", { opening: 0 })
    .inflow("x", (m) => 1)
  .account("b", { opening: 0 })
    .inflow("x", (m) => 1);
