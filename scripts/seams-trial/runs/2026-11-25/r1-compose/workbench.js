// Coin bursts: walk a maze with the D-pad (hold A to dash); each coin you take bursts into sparks where it lay.
// Taking the last coin also sets off a finale in the middle of the box.
import { compose } from "kit/compose";
import { maze } from "maze";
import { particles } from "particles";

const GRID = [
  "###########",
  "#...c...c.#",
  "#.###.###.#",
  "#c..#c#..c#",
  "#.#.#.#.#.#",
  "#c#..c..#c#",
  "###########",
];

const steer = (pl, pad) => {
  pl.dx = pad.left ? -1 : pad.right ? 1 : 0;
  pl.dy = pad.up ? -1 : pad.down ? 1 : 0;
  pl.steps = pad.a ? 3 : 1;
};

// A velocity in a random direction, at a random speed between slow and fast (px per second).
const scatter = (a, b, slow, fast) =>
  vec2(Math.cos(a * 2 * Math.PI), Math.sin(a * 2 * Math.PI)) * (slow + (fast - slow) * b);

export default ($) => {
  const level = maze("level")
    .grid(GRID)
    .start({ x: 1, y: 1 })
    .tick(1 / 8)
    .control(steer);

  // The emitters' x, y are required but unused by 'burst', which starts each particle at the record's point.
  // The box is 4:3, the shape of the particle stage's canvas, so the picture is not stretched.
  const fx = particles("fx")
    .bounds({ width: 440, height: 330 })
    .maxParticles(1500)
    .tick(1 / 60)
    .force("gravity", (p, dt) => { p.vel = p.vel + vec2(0, 160) * dt; })
    .force("drag", (p, dt) => { p.vel = p.vel * (1 - 2.5 * dt); })
    .emitter("sparks", { x: 220, y: 165, maxRate: 0, trigger: "burst", count: 48, forces: ["gravity", "drag"] })
      .rate((t, live) => 0)
      .spawn((p, rng) => {
        p.vel = scatter(rng(), rng(), 60, 160);
        p.life = 0.4 + rng() * 0.4;
      })
    .emitter("embers", { x: 220, y: 165, maxRate: 0, trigger: "burst", count: 16, forces: ["drag"] })
      .rate((t, live) => 0)
      .spawn((p, rng) => {
        p.vel = scatter(rng(), rng(), 10, 40);
        p.life = 0.8 + rng() * 0.6;
      })
    .emitter("finale", { x: 220, y: 165, maxRate: 0, trigger: "pulse", count: 400, forces: ["gravity", "drag"] })
      .rate((t, live) => 0)
      .spawn((p, rng) => {
        p.vel = scatter(rng(), rng(), 120, 420);
        p.life = 1 + rng();
      });

  return compose("coin-bursts")
    .part(level)
    .part(fx)
    .frame(level.frame.cell, fx.frame.px, "fit")
    .wire(level.out.picked, fx.in.burst)
    .wire(level.out.cleared, fx.in.pulse)
    .show(fx);
};
