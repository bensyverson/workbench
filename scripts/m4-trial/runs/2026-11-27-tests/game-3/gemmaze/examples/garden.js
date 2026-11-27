import { gemmaze } from "../gemmaze.grammar.js";

// # wall   . floor   * gem   @ player start
export default () => gemmaze("garden")
  .map([
    "##########",
    "#@..*....#",
    "#..##..#.#",
    "#.*#...#*#",
    "#......#.#",
    "#.####...#",
    "#*....*..#",
    "##########",
  ]);
