import { budget } from "../budget.grammar.js";

export default ($) => {
  let b = budget("loop")
    .param("kids", { value: 3, min: 0, max: 5 })
    .start(2026, 1)
    .horizon(12);
  for (let i = 0; i < $.kids; i++) {
    b = b.account("kid" + i, { opening: 10 })
      .inflow("allowance", (m) => 20);
  }
  return b;
};
