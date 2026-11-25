// REJECT 1: misspelled flow name f.salery (expect: L002)
import { budget } from "../budget.grammar.js";

export default ($) => budget("t")
  .start(2026, 1)
  .horizon(12)
  .account("main", { opening: 100 })
    .inflow("salary", (m) => 4000)
    .outflow("tax", (m, f) => f.salery * 0.2);
