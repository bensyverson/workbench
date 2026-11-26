import { particles } from "../particles.grammar.js";

// Orbit: a pull toward the center, length, Math.abs and Math.sqrt, a kill at the edge of the ring.
const CX = 150;
const CY = 150;
const toCenter = (p) => vec2(CX, CY) - p.pos;

export default ($) => particles("orbit")
  .param("pull", { value: 500, min: 0, max: 2000 })
  .bounds({ width: 300, height: 300 })
  .maxParticles(100)
  .force("pull", (p, dt) => {
    const d = toCenter(p);
    const r = Math.max(length(d), 5);
    p.vel = p.vel + d * ($.pull / (r * r * r)) * dt;
  })
  .update((p, dt) => {
    if (Math.abs(length(toCenter(p)) - 100) > 60) { p.kill(); }
  })
  .emitter("ring", { x: 250, y: 150, maxRate: 5 })
    .rate((t, live) => (live < 50 ? 5 : 0))
    .spawn((p, rng) => {
      p.vel = vec2(0, -Math.sqrt(500 / 100) * (1 + 0.1 * rng()));
      p.life = 30;
    });
