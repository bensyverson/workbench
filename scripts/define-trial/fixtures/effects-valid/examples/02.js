import { garden } from "../garden.grammar.js";

export default ($) => garden("dry")
  .param("rate", { value: 1, min: 0, max: 4 })
  .rain((t) => $.rate * 2);
