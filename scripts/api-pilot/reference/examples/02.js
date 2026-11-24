// A transfer first in its account (its f is empty), helpers that call helpers, a local const in a block body,
// a month param read at build time by .start and .horizon, and a flow named like a param.
import { budget } from "../budget.grammar.js";

const quarterly = (m) => m.month % 3 === 1;
const every = (m, amount) => (quarterly(m) ? amount : 0);

export default ($) => budget("freelance")
  .param("firstMonth", { value: 3, min: 1, max: 12 })
  .param("years", { value: 2, min: 1, max: 10 })
  .param("rate", { value: 0.25, min: 0, max: 0.6 })
  .start(2026, $.firstMonth)
  .horizon($.years * 12)
  .account("business", { opening: 8000 })
    .transfer("personal", (m) => 3000)
    .inflow("invoices", (m) => {
      const base = 5200;
      if (m.index < 3) return base * 0.5;
      return base;
    })
    .outflow("tax", (m, f) => every(m, f.invoices * 3 * $.rate))
    .outflow("rate", (m) => 40)
  .account("personal", { opening: 400 })
    .outflow("living", (m) => 2700);
