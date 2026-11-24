import { budget } from "../budget.grammar.js";

// A block body: build-time code loops over names. The lambdas read only $ and
// their own arguments, never the loop variable (B013).
const POTS = ["food", "fun", "gifts"];

export default ($) => {
  let b = budget("split")
    .param("pay", { value: 3000, min: 0, max: 10000 })
    .start(2026, 1)
    .horizon(6);
  for (const pot of POTS) {
    b = b.account(pot, { opening: 0 })
      .inflow("pay", (m) => $.pay / 3)
      .outflow("tax", (m) => (m.index % 3 === 0 ? Math.round($.pay * 0.1) : 0));
  }
  return b;
};
