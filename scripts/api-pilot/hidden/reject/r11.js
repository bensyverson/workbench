// REJECT 11: lambda calls a function made by another function
import { budget } from "../budget.grammar.js";

const makeBump = (n) => (m) => m.index * n;
const bump = makeBump(2);

export default ($) => budget("t")
  .start(2026, 1)
  .horizon(12)
  .account("main", { opening: 100 })
    .inflow("pay", (m) => 1000 + bump(m));
