// REJECT 12: start called twice
import { budget } from "../budget.grammar.js";

export default ($) => budget("t")
  .start(2026, 1)
  .start(2027, 1)
  .horizon(12)
  .account("main", { opening: 100 })
    .inflow("salary", (m) => 4000);
