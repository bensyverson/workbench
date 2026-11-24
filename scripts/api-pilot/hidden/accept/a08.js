import { budget } from "../budget.grammar.js";

export default ($) => budget("nohorizon")
  .param("pay", { value: 3000, min: 0, max: 20000 })
  .start(2026, 6)
  .account("main", { opening: 10 })
    .inflow("pay", (m) => $.pay)
    .outflow("food", (m) => (m.index % 12 === 11 ? 900 : 600));
