import { budget } from "../budget.grammar.js";

export default ($) => budget("early")
  .start(2026, 3)
  .account("a", { opening: 0 })
    .transfer("b", (m) => (m.date <= monthOf(2026, 6) ? 10 : 0))
    .outflow("c", (m) => m.year - m.month)
  .account("b", { opening: 10 });
