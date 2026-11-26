// Glowworm Deep, the glue: two parts, the cave (a level built from its params) and the game (a miner on it), with
// the cave's start and exit wired into the game. Each part's Program is a function of its own params ($).

import { compose } from "kit/compose";
import { cave } from "./cave.package.js";
import { game } from "./game.package.js";
import { carve } from "./carve.js";

/** The cave part's Program: the level is carved at build time from seed, depth and roughness. @param {any} $ */
export const caveProgram = ($) => {
  const c = cave("cave").param("seed", { value: 7 }).param("depth", { value: 0 }).param("roughness", { value: 45 });
  const level = carve($.seed, $.depth, $.roughness);
  return c.grid(level.grid).start(level.start).exit(level.exit).shade((x, y, rock) => (rock ? 0.2 : 1.0));
};

/** The game part's Program: a miner steered by the pad, one cell per tick. @param {any} _$ */
export const gameProgram = (_$) => game("game").tick(1 / 30).control((m, pad) => {
  m.dx = pad.right ? 1 : pad.left ? -1 : 0;
  m.dy = pad.down ? 1 : pad.up ? -1 : 0;
});

/** The composition of the two parts' builders. @param {any} level @param {any} play */
export const glue = (level, play) => compose("glowworm-deep")
  .part(level).part(play)
  .frame(level.frame.cell, play.frame.cell, { scale: 1, offset: 0 })
  .wire(level.out.start, play.in.start)
  .wire(level.out.exit, play.in.exit)
  .show(play);
