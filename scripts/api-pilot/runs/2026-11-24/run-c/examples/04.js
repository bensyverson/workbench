import { budget } from "../budget.grammar.js";

export default ($) => budget("x").start(2026, 1).account("a", { opening: 0 }).outflow("t", (m) => m.index);
