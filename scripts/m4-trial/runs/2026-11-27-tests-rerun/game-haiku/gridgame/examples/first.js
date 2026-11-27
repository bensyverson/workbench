import { level } from "../gridgame.grammar.js";

// Player starts at (1, 1). Gems at (4, 1) and (5, 3). Walls are "#".
export default ($) =>
  level("first")
    .row("#######")
    .row("#@..*.#")
    .row("#.##..#")
    .row("#....*#")
    .row("#######");
