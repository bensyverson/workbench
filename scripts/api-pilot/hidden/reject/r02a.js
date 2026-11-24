// REJECT 2: transfer to an account that does not exist
import { budget } from "../budget.grammar.js";

export default ($) => budget("t")
  .start(2026, 1)
  .horizon(12)
  .account("main", { opening: 100 })
    .inflow("salary", (m) => 4000)
    .transfer("savings", (m, f) => f.salary * 0.1);
