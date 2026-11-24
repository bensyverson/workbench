import { budget } from "../budget.grammar.js";

export default ($) => budget("tiny")
  .start(2026, 1)
  .account("cash", { opening: 0 });
