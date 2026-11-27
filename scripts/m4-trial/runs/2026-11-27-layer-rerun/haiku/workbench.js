import { compose, layer, page } from "kit/compose";
import { gemgrid } from "gemgrid";
import { scoretimer } from "scoretimer";

// A 12 by 8 level. Rows 6 and 7 are walls, under the score panel, which sits over them.
// The player starts at P and walks right along row 1, picking up the gem at column 5.
const LEVEL = [
  "############",
  "#P...*....*#",
  "#.##.####.*#",
  "#....#....##",
  "#.*..#.*..##",
  "#.####.##..#",
  "############",
  "############",
];

export default ($) => {
  const game = gemgrid("Coins").map(LEVEL);
  // No worth declared: the Dialect's default of 1, so each gem scores one point.
  const round = scoretimer("Round").label("GEM ROUND").lasts(30);
  // The score panel is 160 by 24 pixels; 16 across and 104 down puts it over the bottom two wall rows.
  return compose("coin-round")
    .part(game)
    .part(round)
    .frame(round.frame.panel, game.frame.px, { scale: 1, offset: [16, 104] })
    .wire(page.out.pad, game.in.pad)
    .wire(game.out.picked, round.in.scored)
    .show(game.out.view, round.out.view);
};
