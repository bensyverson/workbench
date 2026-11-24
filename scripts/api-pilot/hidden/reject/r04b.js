// REJECT 4: arithmetic on m.date
import { budget } from "../budget.grammar.js";

export default ($) => budget("t")
  .start(2026, 1)
  .horizon(12)
  .account("main", { opening: 100 })
    .outflow("trip", (m) => (m.date + 1 === monthOf(2026, 7) ? 2000 : 0));
