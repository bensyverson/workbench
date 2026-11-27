import { gemgrid } from "../gemgrid.grammar.js";

// # wall, . floor, * gem, P start
export default () => gemgrid("cavern")
  .map([
    "############",
    "#P..*..#..*#",
    "#.##...#.#.#",
    "#.*#.*...#.#",
    "#..#####.#.#",
    "#.....*#...#",
    "#.###..#.*.#",
    "#*..#....#*#",
    "############",
  ])
  .pace(0.15);
