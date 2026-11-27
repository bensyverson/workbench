import { roundkeeper } from "../roundkeeper.grammar.js";

export default ($) => roundkeeper("sprint")
  .seconds(10)
  .worth(10)
  .goal(30)
  .label("Gems");
