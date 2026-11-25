import { particles } from "../particles.grammar.js";

const G = 98;

export default ($) => particles("rain")
  .emitter("cloud", { x: 0, y: 0, maxRate: 0 })
    .rate((t) => 0)
    .spawn((p) => { p.vel = vec2(0, G); })
  .bounds({ width: 1, height: 1 })
  .force("fall", (p, dt) => { p.vel = vec2(p.vel.x, p.vel.y + G * dt); })
  .maxParticles(10000)
  .tick(1)
  .emitter("edge", { x: 1, y: 1, maxRate: 5, forces: ["fall"] })
    .rate(() => {
      let r = 0;
      for (let k = 1; k <= G; k += 1) { if (k > 3) { continue; } r += 1; }
      return Math.min(r, 5);
    })
    .spawn((p, rng, i) => {
      if (i > 2) { return; }
      p.life = Math.floor(rng() * 3) + 1;
      p.pos = -p.pos + vec2(2, 2) / 2 * 1;
    });
