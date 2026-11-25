// REJECT 1: reads a flow of another account (expect: L002)
import { budget } from "../budget.grammar.js";

export default ($) => budget("t")
  .start(2026, 1)
  .horizon(12)
  .account("main", { opening: 100 })
    .inflow("salary", (m) => 4000)
  .account("other", { opening: 0 })
    .outflow("tax", (m, f) => f.salary * 0.2);
