import { tally } from "../tally.grammar.js";

export default ($) => tally("sprint")
  .seconds(30)
  .worth(10)
  .goal(100)
  .label("COINS");
