// A coin hunt whose pickups burst: the maze's coins feed the particles' burst, and the player's cell
// feeds the anchor, so the shown stage has a marker where the player is.
import { compose } from "kit/compose";
import { maze } from "maze";
import { particles } from "particles";

export default ($) => {
  const hunt = maze("hunt")
    .grid([
      "###########",
      "#...#....c#",
      "#.#.#.###.#",
      "#.#..c....#",
      "#.###.##.##",
      "#c....#..c#",
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
      pl.steps = 1;
    });

  const fx = particles("fx")
    .bounds({ width: 400, height: 300 })
    .maxParticles(800)
    .tick(1 / 60)
    .force("gravity", (p, dt) => { p.vel = p.vel + vec2(0, 160) * dt; })
    .force("drag", (p, dt) => { p.vel = p.vel * (1 - 2 * dt); })
    // The coin burst: a ring of fast sparks with a slower core, thrown a little upward.
    .emitter("coin", { x: 200, y: 150, maxRate: 0, on: "burst", count: 90, forces: ["gravity", "drag"] })
      .rate((t, live) => 0)
      .spawn((p, rng, i) => {
        const angle = rng() * 2 * Math.PI;
        const speed = i % 3 === 0 ? 20 + rng() * 40 : 90 + rng() * 40;
        p.vel = vec2(Math.cos(angle), Math.sin(angle)) * speed + vec2(0, -40);
        p.life = 0.5 + rng() * 0.6;
        p.size = 2;
      })
    // The player's marker: very short-lived dots around the followed place.
    .emitter("marker", { x: 0, y: 0, maxRate: 240, follow: "anchor", forces: [] })
      .rate((t, live) => 240)
      .spawn((p, rng) => {
        p.pos = p.pos + vec2(rng() - 0.5, rng() - 0.5) * 8;
        p.life = 0.08;
        p.size = 2;
      });

  return compose("coin-burst")
    .part(hunt)
    .part(fx)
    .frame(hunt.frame.cell, fx.frame.box, "fit")
    .wire(hunt.out.pickup, fx.in.burst)
    .wire(hunt.out.player, fx.in.anchor)
    .show(fx);
};
