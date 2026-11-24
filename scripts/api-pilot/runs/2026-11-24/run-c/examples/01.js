import { budget } from "../budget.grammar.js";

export default ($) => budget("x").start(2026, 1).account("a", { opening: 0 }).outflow("food", (m) => 5).account("b", { opening: 0 }).outflow("food", (m) => 6).inflow("pay", (m) => 1).outflow("rent", (m) => 2);
