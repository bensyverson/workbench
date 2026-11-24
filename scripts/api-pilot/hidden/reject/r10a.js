// REJECT 10: Math.sin in a lambda
import { budget } from "../budget.grammar.js";

export default ($) => budget("t")
  .start(2026, 1)
  .horizon(12)
  .account("main", { opening: 100 })
    .inflow("wave", (m) => 100 + Math.sin(m.index) * 10);
