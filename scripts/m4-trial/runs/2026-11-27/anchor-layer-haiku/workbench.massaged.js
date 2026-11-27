import { compose, page } from "kit/compose";
import { gemgrid } from "gemgrid";
import { scoretimer } from "scoretimer";

// A 12 by 8 level. The top two rows are walls, so the score panel covers walls only.
// P is the player's start; the D-pad walks right along row 2 to the gem at column 6,
// then down column 10 to the gem at row 5.
export default ($) => {
  const level = gemgrid("Grab").map([
    "############",
    "############",
    "#P....*....#",
    "#.##.#####.#",
    "#..........#",
    "#.####.###*#",
    "#..........#",
    "############",
  ]);

  // A 30 second round; each gem picked up is one scoring event worth one point.
  const round = scoretimer("Round").label("GEM GRAB").lasts(30);

  return compose("gem-grab")
    .part(level)
    .part(round)
    .wire(page.out.pad, level.in.pad)
    .wire(level.out.picked, round.in.scored, { set: { points: 1 } })
    .frame(round.frame.panel, level.frame.px, { scale: 1, offset: [16, 0] })
    .show(level.out.view, round.out.view);
};
