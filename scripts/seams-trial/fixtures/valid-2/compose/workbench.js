import { compose } from "kit/compose";
import { maze } from "maze";
import { particles } from "particles";

// Each coin the player picks up bursts into sparks on the particles' box, at the coin's cell.
const GRID = [
  "##########",
  "#..c...c.#",
  "#.##.###.#",
  "#c.....c.#",
  "#.###.##.#",
  "#...c....#",
  "##########",
];

const steer = (pl, pad) => {
  pl.dx = 0;
  pl.dy = 0;
  if (pad.left) pl.dx = -1;
  if (pad.right) pl.dx = 1;
  if (pad.up) pl.dy = -1;
  if (pad.down) pl.dy = 1;
  pl.steps = 1;
};

export default ($) => {
  const level = maze("level").grid(GRID).start({ x: 1, y: 1 }).tick(1 / 8).control(steer);
  const fx = particles("fx")
    .bounds({ width: 320, height: 224 })
    .maxParticles(600)
    .emitter("pop", { x: 160, y: 112, maxRate: 0, trigger: "burst", perEvent: 24 })
      .rate((t, live) => 0)
      .spawn((p, rng, i) => {
        p.pos = ev.at;
        p.vel = vec2(rng() - 0.5, rng() - 0.5) * inp.speed * 2;
        p.life = 0.5;
      });

  return compose("coin-sparks")
    .part(level)
    .part(fx)
    .frame(level.frame.cell, fx.frame.px, "fit")
    .wire(level.out.coin, fx.in.burst, { rename: { cell: "at" } })
    .show(fx);
};
