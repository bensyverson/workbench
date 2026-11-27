import { gemgrid } from "../gemgrid.grammar.js";

export default () => gemgrid("Garden")
  .map([
    "############",
    "#P..*..#...#",
    "#.##.#.#.*.#",
    "#..*.#...#.#",
    "####.###.#.#",
    "#*.......#*#",
    "############",
  ]);
