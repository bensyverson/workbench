// REJECT 5: lambda returns a boolean (expect: L003)
import { budget } from "../budget.grammar.js";

export default ($) => budget("t")
  .start(2026, 1)
  .horizon(12)
  .account("main", { opening: 100 })
    .outflow("odd", (m) => m.index > 3);
