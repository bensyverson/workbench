// REJECT 4: m.date compared with a number (expect: L003)
import { budget } from "../budget.grammar.js";

export default ($) => budget("t")
  .start(2026, 1)
  .horizon(12)
  .account("main", { opening: 100 })
    .outflow("trip", (m) => (m.date === 202607 ? 2000 : 0));
