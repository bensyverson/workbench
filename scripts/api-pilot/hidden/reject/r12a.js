// REJECT 12: start is missing
import { budget } from "../budget.grammar.js";

export default ($) => budget("t")
  .horizon(12)
  .account("main", { opening: 100 })
    .inflow("salary", (m) => 4000);
