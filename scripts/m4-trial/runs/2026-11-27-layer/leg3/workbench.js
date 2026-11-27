import { compose, page } from "kit/compose";
import { gemgrid } from "gemgrid";
import { scoretimer } from "scoretimer";

export default () => {
  // 12 by 9 cells (192 by 144 pixels). The top two rows are wall: the score panel covers them.
  const level = gemgrid("level")
    .map([
      "############",
      "############",
      "#P..*..#...#",
      "#.##.#.#.#.#",
      "#..*.#...#*#",
      "#.##.###.#.#",
      "#*...*.....#",
      "#.####.###*#",
      "############",
    ]);

  const round = scoretimer("round")
    .label("GEM RUSH")
    .lasts(30);

  return compose("gem-rush")
    .part(level)
    .part(round)
    // the 160-wide panel at one pixel per unit, centered along the top of the 192-wide level
    .frame(round.frame.panel, level.frame.px, { scale: 1, offset: [16, 0] })
    .wire(page.out.pad, level.in.pad)
    // one point per gem; set, so the producer's running `collected` is plainly not the points
    .wire(level.out.picked, round.in.scored, { set: { points: 1 } })
    .show(level.out.view, round.out.view);
};
