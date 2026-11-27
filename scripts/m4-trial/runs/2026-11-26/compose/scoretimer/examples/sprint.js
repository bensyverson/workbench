import { scoretimer } from "../scoretimer.grammar.js";

export default () => scoretimer("Sprint")
  .label("COIN SPRINT")
  .lasts(30)
  .worth(10)
  .target(100);
