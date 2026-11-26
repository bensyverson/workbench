import { compose } from "kit/compose";
import { maze } from "maze";
import { particles } from "particles";

// A small room with a few pillars; coins sit on open cells so the nearest one is reachable from most places.
const GRID = [
  "###########",
  "#c...#...c#",
  "#.#.....#.#",
  "#.....c...#",
  "###.###.###",
  "#c....c...#",
  "#.#.###.#.#",
  "#.........#",
  "###########",
];

export default ($) => {
  // The player walks one cell per step in the direction the D-pad holds.
  const labyrinth = maze("labyrinth")
    .grid(GRID)
    .start({ x: 4, y: 2 })
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

  // A burst of sparks that falls slightly and dies quickly; the burst emitter is driven by the `burst` input.
  const sparks = particles("sparks")
    .bounds({ width: 300, height: 260 })
    .maxParticles(400)
    .tick(1 / 60)
    .force("fall", (p, dt) => { p.vel = p.vel + vec2(0, 60) * dt; })
    .emitter("burst", { x: 150, y: 130, maxRate: 0, on: "burst", burst: 24, forces: ["fall"] })
      .rate((t, live) => 0)
      .spawn((p, rng, i) => {
        const a = (i / 24) * 2 * Math.PI + rng() * 0.3;
        p.vel = vec2(Math.cos(a), Math.sin(a)) * (30 + rng() * 30);
        p.life = 0.9;
        p.size = 2;
      });

  return compose("light-show")
    .part(labyrinth)
    .part(sparks)
    .frame(labyrinth.frame.cell, sparks.frame.box, "fit")
    .wire(labyrinth.out.pickup, sparks.in.burst, { rename: { at: "pos" } })
    .show(sparks);
};
