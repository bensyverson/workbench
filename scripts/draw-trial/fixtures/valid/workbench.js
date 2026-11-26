import { compose } from "kit/compose";
import { maze } from "maze";
import { particles } from "particles";
import { arcade } from "arcade";

export default ($) => {
  const level = maze("level")
    .grid(["#######", "#c...c#", "#.###.#", "#c...c#", "#######"])
    .start({ x: 3, y: 1 })
    .tick(1 / 8)
    .control((pl, pad) => {
      pl.dx = 0;
      pl.dy = 0;
      if (pad.left) pl.dx = -1;
      if (pad.right) pl.dx = 1;
      if (pad.up) pl.dy = -1;
      if (pad.down) pl.dy = 1;
      pl.steps = 1;
    });
  const fx = particles("sparks")
    .bounds({ width: 280, height: 200 })
    .maxParticles(400)
    .tick(1 / 30)
    .emitter("pop", { x: 0, y: 0, maxRate: 0, trigger: "burst", perEvent: 24 })
      .rate((t, live) => 0)
      .spawn((p, rng, i) => { p.pos = ev.at; p.vel = vec2(rng() - 0.5, rng() - 0.5) * inp.speed * 2; p.life = 0.6; p.size = 2; });
  const cab = arcade("cab").screen({ width: 320, height: 240 });
  return compose("coin-arcade")
    .part(level).part(fx).part(cab)
    .frame(level.frame.cell, fx.frame.px, "fit")
    .frame(fx.frame.px, cab.frame.screen, { scale: 1, offset: [20, 20] })
    .wire(level.out.coin, fx.in.burst, { rename: { cell: "at" } })
    .wire(level.out.view, cab.in.board)
    .wire(fx.out.view, cab.in.fx)
    .wire(level.out.score, cab.in.score)
    .show(cab);
};
