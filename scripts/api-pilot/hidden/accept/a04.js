import { budget } from "../budget.grammar.js";

export default ($) => budget("dates")
  .start(2026, 10)
  .horizon(18)
  .account("main", { opening: 100 })
    .inflow("pay", (m) => (m.month === 12 ? 5000 : 3000))
    .outflow("early", (m) => (m.date < monthOf(2027, 1) ? 50 : 0))
    .outflow("until", (m) => (m.date <= monthOf(2027, 3) ? 20 : 0))
    .outflow("summer", (m) => (m.date === monthOf(2027, 7) ? 900 : 0))
    .outflow("yearly", (m) => (m.year === 2027 ? 10 : 0) + m.index);
