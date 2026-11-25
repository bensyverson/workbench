// REJECT 6: negative opening (expect: U006)
import { budget } from "../budget.grammar.js";

export default ($) => budget("t")
  .start(2026, 1)
  .horizon(12)
  .account("main", { opening: -50 })
    .inflow("salary", (m) => 4000);
