import { budget } from "../budget.grammar.js";

export default ($) => budget("x").start(2026, 1).account("a", { opening: 0 })
  .outflow("food", (m) => 5)
  .outflow("rent", (m, f) => f.food);
