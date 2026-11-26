import { compose } from "kit/compose";
import { maze } from "maze";
import { particles } from "particles";

// A coin picked up in the maze bursts into sparks on the particles stage, at the coin's cell.
const GRID = [
  "##########",
  "#..c...c.#",
  "#.##.###.#",
  "#c.....c.#",
  "#.###.##.#",
  "#...c....#",
  "#.#.###c.#",
  "##########",
];
const CELL = 32;

const steer = (pl, pad) => {
  pl.dx = 0;
  pl.dy = 0;
  if (pad.left) pl.dx = -1;
  if (pad.right) pl.dx = 1;
  if (pad.up) pl.dy = -1;
  if (pad.down) pl.dy = 1;
  pl.steps = pad.b ? 0 : 1;
};

export default ($) => {
  const level = maze("level").grid(GRID).start({ x: 1, y: 1 }).control(steer);
  const fx = particles("fx")
    .bounds({ width: 320, height: 320 })
    .maxParticles(500)
    .emitter("pop", { x: 160, y: 160, maxRate: 24, trigger: "burst" })
      .rate((t, live) => 0)
      .spawn((p, rng) => { p.vel = vec2(rng() - 0.5, rng() - 0.5) * inp.radius * 4; p.life = 0.5; });

  // the maze's box of cells fits the 320 x 320 box, centered: 32 px a cell (CELL, for an explicit edge)
  return compose("coin-bursts")
    .part(level)
    .part(fx)
    .frame(level.frame.cell, fx.frame.px, "fit")
    .wire(level.out.picked, fx.in.burst)
    .show(fx);
};
