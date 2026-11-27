import { lens } from "../lens.grammar.js";

// Two lenses: drag a rim to change a radius, a center to move one.
export default ($) => lens("bench")
  .param("focus", { value: 5, min: 0, max: 10 })
  .lens({ radius: 12, at: [30, 40] })
  .lens({ radius: 20, at: [65, 60] });
