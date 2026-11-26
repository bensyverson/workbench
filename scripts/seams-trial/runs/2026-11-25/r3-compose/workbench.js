// A coin burst: the maze says where a coin was picked up, the particle system bursts there.
import { compose } from "kit/compose";
import { maze } from "maze";
import { particles } from "particles";

// 12 cells by 9, the same 4:3 shape as the particle box below.
const GRID = [
  "############",
  "#c...#....c#",
  "#.##.#.###.#",
  "#.#......#.#",
  "#...##c#...#",
  "#.#......#.#",
  "#.##.#.###.#",
  "#c...#....c#",
  "############",
];

const steer = (pl, pad) => {
  pl.dx = 0;
  pl.dy = 0;
  if (pad.left) pl.dx = -1;
  if (pad.right) pl.dx = 1;
  if (pad.up) pl.dy = -1;
  if (pad.down) pl.dy = 1;
  pl.steps = pad.b ? 0 : pad.a ? 2 : 1;
};

export default ($) => {
  const level = maze("level")
    .grid(GRID)
    .start({ x: 1, y: 4 })
    .tick(1 / 8)
    .control(steer);

  const fx = particles("fx")
    .param("sparks", { value: 90, min: 10, max: 200 })
    .bounds({ width: 384, height: 288 })
    .maxParticles(2000)
    .tick(1 / 60)
    .force("gravity", (p, dt) => { p.vel = p.vel + vec2(0, 220) * dt; })
    .force("drag", (p, dt) => { p.vel = p.vel * (1 - 2.5 * dt); })
    // The flash: a fast, even ring that is gone almost at once.
    .emitter("ring", { x: 192, y: 144, maxRate: 48, forces: ["drag"], trigger: "burst" })
      .rate((t, live) => 48)
      .spawn((p, rng, i) => {
        const a = (i / 48) * 2 * Math.PI;
        p.vel = vec2(Math.cos(a), Math.sin(a)) * 130;
        p.life = 0.35;
      })
    // The shower: sparks thrown mostly upward that fall back.
    .emitter("shower", { x: 192, y: 144, maxRate: 200, forces: ["gravity", "drag"], trigger: "burst" })
      .rate((t, live) => $.sparks)
      .spawn((p, rng) => {
        const a = rng() * 2 * Math.PI;
        p.vel = vec2(Math.cos(a), Math.sin(a)) * (30 + 90 * rng()) + vec2(0, -80);
        p.life = 0.5 + 0.7 * rng();
      });

  return compose("coin-bursts")
    .part(level)
    .part(fx)
    .frame(level.frame.cell, fx.frame.px, "fit")
    .wire(level.out.picked, fx.in.burst)
    .show(fx);
};
