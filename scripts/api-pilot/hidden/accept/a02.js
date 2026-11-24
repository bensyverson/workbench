import { budget } from "../budget.grammar.js";

export default ($) => budget("household")
  .param("rent", { value: 1500, min: 0, max: 5000 })
  .param("saveRate", { value: 0.1, min: 0, max: 0.5 })
  .start(2026, 1)
  .horizon(12)
  .account("checking", { opening: 1200 })
    .inflow("salary", (m) => 4000)
    .outflow("rent", (m) => $.rent)
    .transfer("savings", (m, f) => (f.salary - f.rent) * $.saveRate)
  .account("savings", { opening: 0 })
    .inflow("interest", (m, f, balance) => balance * 0.003);
