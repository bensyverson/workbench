// REJECT 1: f.food read before food is declared (expect: L002)
import { budget } from "../budget.grammar.js";

export default ($) => budget("t")
  .start(2026, 1)
  .horizon(12)
  .account("main", { opening: 100 })
    .outflow("rent", (m, f) => f.food + 1)
    .outflow("food", (m) => 600);
