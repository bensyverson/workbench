// REJECT 9: reads undeclared param $.rnet
import { budget } from "../budget.grammar.js";

export default ($) => budget("t")
  .param("rent", { value: 1500, min: 0, max: 5000 })
  .start(2026, 1)
  .horizon(12)
  .account("main", { opening: 100 })
    .outflow("rent", (m) => $.rnet);
