import { compose } from "kit/compose";
import { maze } from "maze";
import { particles } from "particles";

// A coin picked up in the maze bursts sparks where the coin was.
export default ($) => {
  const coins = maze("coins")
    .grid([
      "###########",
      "#.........#",
      "#.c...c...#",
      "#.........#",
      "#...c.....#",
      "###########",
    ])
    .start({ x: 1, y: 1 })
    .tick(1 / 8)
    .control((pl, pad) => {
      pl.dx = 0;
      pl.dy = 0;
      if (pad.left) pl.dx = -1;
      if (pad.right) pl.dx = 1;
      if (pad.up) pl.dy = -1;
      if (pad.down) pl.dy = 1;
      pl.steps = pl.dx !== 0 || pl.dy !== 0 ? 1 : 0;
    });

  const sparks = particles("sparks")
    .bounds({ width: 400, height: 300 })
    .maxParticles(400)
    .tick(1 / 30)
    .emitter("burst", { x: 200, y: 150, maxRate: 0, from: "pickup", burst: 12 })
      .rate((t, live) => 0)
      .spawn((p, rng, i) => {
        p.pos = pickup.at;
        p.vel = vec2(rng() - 0.5, rng() - 0.5) * 200;
        p.life = 0.6 + rng() * 0.4;
        p.size = 2;
      });

  return compose("coin-burst")
    .part(coins)
    .part(sparks)
    .frame(coins.frame.cell, sparks.frame.box, "fit")
    .wire(coins.out.coin, sparks.in.pickup)
    .show(sparks);
};
