import { budget } from "../budget.grammar.js";

// Top-level helpers and plain-data constants: lambdas may use them.
const yearly = (m, amount) => (m.index % 12 === 0 ? amount : 0);
const FOOD = 600;

export default ($) => budget("household")
  .param("rent", { value: 1500, min: 0, max: 5000 })        // read inside lambdas: changes without a rebuild
  .param("months", { value: 12, min: 1, max: 60 })          // read at build time below
  .param("saveRate", { value: 0.1, min: 0, max: 0.5 })
  .start(2026, 1)                                           // year, month (1-12)
  .horizon($.months)                                        // how many months to plan
  .account("checking", { opening: 1200 })
    .inflow("salary", (m) => 4000)
    .outflow("rent", (m) => $.rent)
    .outflow("food", (m) => (m.index % 12 === 11 ? 900 : FOOD))
    .outflow("insurance", (m) => yearly(m, 800))
    .outflow("trip", (m) => (m.date === monthOf(2026, 7) ? 2000 : 0))
    .transfer("savings", (m, f) => (f.salary - f.rent) * $.saveRate)
  .account("savings", { opening: 0 })
    .inflow("interest", (m, f, balance) => balance * 0.003);
