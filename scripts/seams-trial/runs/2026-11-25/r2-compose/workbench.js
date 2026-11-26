import { compose } from "kit/compose";
import { maze } from "maze";
import { particles } from "particles";

// A maze of 10 columns by 8 rows with six coins. The player walks with the D-pad.
const GRID = [
  "##########",
  "#c......c#",
  "#.######.#",
  "#.#...c..#",
  "#...#.c..#",
  "#.###.####",
  "#c......c#",
  "##########",
];

// Steering: one step per tick, four directions, no dash.
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
  const level = maze("level")
    .grid(GRID)
    .start({ x: 2, y: 1 })
    .tick(1 / 8)
    .control(steer);

  // Sparks that burst from each coin pickup. Each burst record places its sparks at the pickup's point,
  // and spawn scatters them within inp.radius of it.
  const fx = particles("fx")
    .bounds({ width: 320, height: 256 })
    .maxParticles(400)
    .seed(3)
    .tick(1 / 30)
    .force("gravity", (p, dt) => { p.vel = p.vel + vec2(0, 120) * dt; })
    .force("drag", (p, dt) => { p.vel = p.vel * (1 - 2 * dt); })
    .update((p, dt) => { if (p.age > p.life) { p.kill(); } })
    .emitter("spark", { x: 160, y: 128, maxRate: 300, forces: ["gravity", "drag"], trigger: "burst" })
      .rate((t, live) => 60)
      .spawn((p, rng) => {
        p.pos = p.pos + vec2((rng() - 0.5) * 2 * inp.radius, (rng() - 0.5) * 2 * inp.radius);
        p.vel = vec2((rng() - 0.5) * 160, (rng() - 0.5) * 160 - 60);
        p.life = 0.6 + rng() * 0.5;
      });

  return compose("coin-bursts")
    .part(level)
    .part(fx)
    .frame(level.frame.cell, fx.frame.px, "fit")
    .wire(level.out.picked, fx.in.burst)
    .show(fx);
};
