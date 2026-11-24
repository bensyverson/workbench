import { budget } from "../budget.grammar.js";

const clamp = (x) => Math.min(Math.max(x, 0), 100);
const pay = (m) => Math.round(Math.abs(m.year - 2026) * 10) + m.month;
const START_Y = 2026;
export default ($) => budget("x").param("p", { value: 5, min: 1, max: 10 }).start(2026, 12).horizon($.p).account("a", { opening: 0 }).inflow("pay", (m) => clamp(pay(m))).outflow("t", (m) => (m.date >= monthOf(START_Y, 1) && m.date <= monthOf(2026, 9) ? 1 : 0)).transfer("b", (m, f, balance) => Math.min(f.pay, balance)).account("b", { opening: 0 });
