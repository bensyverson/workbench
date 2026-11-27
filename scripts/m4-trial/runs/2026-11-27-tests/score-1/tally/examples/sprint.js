import { tally } from "../tally.grammar.js";

export default () => tally("sprint")
  .title("SPRINT")
  .seconds(30)
  .worth(10)
  .goal(100);
