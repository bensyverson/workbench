// REJECT 7: horizon given a lambda
import { budget } from "../budget.grammar.js";

export default ($) => budget("t")
  .param("months", { value: 12, min: 1, max: 60 })
  .start(2026, 1)
  .horizon(() => $.months)
  .account("main", { opening: 100 })
    .inflow("salary", (m) => 4000);
