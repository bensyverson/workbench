import { particles } from "../particles.grammar.js";

// vec2 arithmetic: add, subtract, number * vec, vec * number, vec / number,
// .x and .y reads, length(), and assigning a local vector's components.
const CENTER = 200;

export default ($) => particles("vectors")
  .bounds({ width: 400, height: 400 })
  .maxParticles(250)
  .force("orbit", (p, dt) => {
    const toCenter = vec2(CENTER, CENTER) - p.pos;
    const d = length(toCenter);
    if (d > 1) {
      p.vel = p.vel + (toCenter / d) * 50 * dt;
    }
  })
  .update((p, dt) => {
    let v = p.vel / 2;
    v.x = Math.abs(v.x);
    v.y = v.y + 1;
    p.size = 1 + length(v) / 100;
    p.pos = p.pos + 0.5 * (p.vel * dt) - vec2(0, 0);
  })
  .emitter("ring", { x: 300, y: 200, maxRate: 60 })
    .rate((t, live) => 60)
    .spawn((p, rng) => {
      const dir = vec2(0, 1);
      p.vel = 2 * dir * 40 + vec2(rng(), rng());
    });
