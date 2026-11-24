import { budget } from "../budget.grammar.js";

const yearly = (m, amount) => (m.index % 12 === 0 ? amount : 0);
const half = (x) => x / 2;
const seasonal = (m, base) => half(base) + yearly(m, base);

export default ($) => budget("helpers")
  .start(2026, 1)
  .horizon(36)
  .account("main", { opening: 2000 })
    .inflow("pay", (m) => 3500)
    .outflow("insurance", (m) => yearly(m, 800))
    .outflow("tax", (m, f) => seasonal(m, f.pay * 0.1));
