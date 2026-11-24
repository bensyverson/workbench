import { budget } from "../budget.grammar.js";

const bump = (m) => 100 + m.index;

export default ($) => budget("mixed")
  .param("rent", { value: 1000, min: 0, max: 3000 })
  .start(2025, 12)
  .horizon(120)
  .account("a", { opening: 0 })
    .outflow("zero", () => 5)
    .inflow("one", (m) => bump(m) + $.rent)
    .outflow("two", (m, f) => f.one * 0.1)
    .inflow("three", (m, f, balance) => Math.max(0, balance) * 0.01 + m.year - m.year + m.month - m.month);
