// REJECT 2: transfer to its own account
import { budget } from "../budget.grammar.js";

export default ($) => budget("t")
  .start(2026, 1)
  .horizon(12)
  .account("main", { opening: 100 })
    .inflow("salary", (m) => 4000)
    .transfer("main", (m, f) => f.salary * 0.1);
