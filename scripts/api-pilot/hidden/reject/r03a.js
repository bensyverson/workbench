// REJECT 3: two flows with the same name in one account (expect: A003)
import { budget } from "../budget.grammar.js";

export default ($) => budget("t")
  .start(2026, 1)
  .horizon(12)
  .account("main", { opening: 100 })
    .outflow("food", (m) => 600)
    .outflow("food", (m) => 50);
