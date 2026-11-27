// A timed gem hunt: the grid game, steered by the page's D-pad, under a 30-second score panel.
import { compose, page } from "kit/compose";
import { gemgrid } from "gemgrid";
import { scoretimer } from "scoretimer";

export default () => {
  // 12 by 8 cells (192 by 128 pixels). The top two rows are solid wall, so the
  // score panel (24 pixels tall) covers no cell the player can reach.
  const level = gemgrid("level").map([
    "############",
    "############",
    "#P..*....*.#",
    "#.##.##.##.#",
    "#..*....*..#",
    "#.##.##.##.#",
    "#*...*....*#",
    "############",
  ]);
  const round = scoretimer("round").label("GEM HUNT").lasts(30);

  return compose("timed-gem-hunt")
    .part(level)
    .part(round)
    .wire(page.out.pad, level.in.pad)
    // One point per gem. The gem's position and running count are not wanted.
    .wire(level.out.picked, round.in.scored, { set: { points: 1 } })
    // The 160-wide panel, one pixel a unit, centered along the top of the level.
    .frame(round.frame.panel, level.frame.px, { scale: 1, offset: [16, 0] })
    // Bottom first: the game, then the score over it.
    .show(level.out.view, round.out.view);
};
