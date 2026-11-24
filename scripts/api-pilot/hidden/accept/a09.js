import { budget } from "../budget.grammar.js";

export default ($) => budget("buildtime")
  .param("months", { value: 36, min: 1, max: 60 })
  .param("rich", { value: 1, min: 0, max: 1 })
  .start(2026, 1)
  .horizon($.months > 24 ? 24 : $.months)
  .account("main", { opening: $.rich > 0 ? 5000 : 0 })
    .inflow("pay", (m) => 3000)
    .outflow("rent", (m) => ($.rich > 0 ? 1800 : 900));
