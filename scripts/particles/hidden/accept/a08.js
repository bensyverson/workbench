import { particles } from "../particles.grammar.js";

// Every allowed Math name: min, max, abs, sqrt, floor, sin, cos, PI.
export default ($) => particles("math")
  .bounds({ width: 500, height: 500 })
  .maxParticles(1000)
  .update((p, dt) => {
    const a = Math.abs(p.vel.x) + Math.sqrt(Math.abs(p.vel.y));
    p.size = Math.min(4, Math.max(1, Math.floor(a / 10)));
  })
  .emitter("spiral", { x: 250, y: 250, maxRate: 120 })
    .rate((t) => 60 + 60 * Math.cos(t * Math.PI))
    .spawn((p, rng, i) => {
      const angle = rng() * 2 * Math.PI;
      p.vel = vec2(Math.cos(angle), Math.sin(angle)) * 80;
    });
