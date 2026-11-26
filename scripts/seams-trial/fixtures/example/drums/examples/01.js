import { drums } from "../drums.grammar.js";

// Four on the floor, with a backbeat; the first step of each bar is loudest.
export default ($) => drums("beat")
  .length(16)
  .tempo(8)
  .accent((step) => (step % 16 === 0 ? 1 : 0.6))
  .lane("kick", [0, 4, 8, 12])
  .lane("snare", [4, 12]);
