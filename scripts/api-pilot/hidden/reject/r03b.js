// REJECT 3: two accounts with the same name
import { budget } from "../budget.grammar.js";

export default ($) => budget("t")
  .start(2026, 1)
  .horizon(12)
  .account("main", { opening: 100 })
    .inflow("salary", (m) => 4000)
  .account("main", { opening: 0 })
    .inflow("interest", (m) => 1);
