import { budget } from "../budget.grammar.js";

const cap = (x) => Math.min(x, 5000);

export default ($) => {
  const b = budget("loop")
    .param("n", { value: 3, min: 1, max: 10 })
    .param("bonus", { value: 100, min: 0, max: 1000 })
    .start(2025, 12)
    .horizon($.n);
  let chain = b.account("main", { opening: 500 })
    .inflow("pay", (m) => cap(3000 + $.bonus))
    .outflow("bills", (m, f) => Math.round(f.pay * 0.3))
    .transfer("rainy", (m, f, balance) => Math.max(0, balance * 0.1))
    .transfer("rainy", (m, f) => Math.abs(f.bills - 10));
  chain = chain.account("rainy", { opening: 0 });
  return chain.account("empty", { opening: 5 });
};
