import { budget } from "../budget.grammar.js";

export default ($) => { let b = budget("x").start(2026, 1); for (let i = 0; i < 2; i++) { b = b.account("acc" + i, { opening: 0 }); } return b.account("z", { opening: 1 }).outflow("cut", (m) => (m.date < monthOf(2026, 3) ? 10 : 0)); };
