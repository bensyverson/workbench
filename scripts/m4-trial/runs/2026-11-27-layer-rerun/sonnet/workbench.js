// A timed gem hunt: gemgrid played with the page's D-pad, scoretimer drawn over it.
import { compose, page } from "kit/compose";
import { gemgrid } from "gemgrid";
import { scoretimer } from "scoretimer";

export default () => {
  // The top two rows are solid wall: the score panel (24 px tall) sits over them.
  const level = gemgrid("level").map([
    "############",
    "############",
    "#P..*...*..#",
    "#.##.##.##.#",
    "#*...*....*#",
    "#.##.##.##.#",
    "#..*....*..#",
    "############",
  ]);
  const round = scoretimer("round")
    .label("GEM HUNT")
    .lasts(30);

  return compose("gem-hunt")
    .part(level)
    .part(round)
    // The panel is 160 wide and the level 192 px: (192 - 160) / 2 = 16 centers it at the top.
    .frame(round.frame.panel, level.frame.px, { scale: 1, offset: [16, 0] })
    .wire(page.out.pad, level.in.pad)
    // One gem, one point. The pickup's running total (collected) is deliberately not used.
    .wire(level.out.picked, round.in.scored, { set: { points: 1 } })
    .show(level.out.view, round.out.view);
};
