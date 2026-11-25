import { particles } from "../particles.grammar.js";

// Spawn calls rng several times and uses i; it writes pos, vel, life, size and
// a declared field. Randomness is kept in a field for update to use later.
export default ($) => particles("confetti")
  .bounds({ width: 400, height: 400 })
  .maxParticles(600)
  .seed(42)
  .field("wobble", { value: 0 })
  .update((p, dt) => {
    p.vel = vec2(p.vel.x + p.wobble * Math.sin(p.age * 5), p.vel.y);
  })
  .emitter("cannon", { x: 20, y: 380, maxRate: 300 })
    .rate((t, live) => 100)
    .spawn((p, rng, i) => {
      const r = rng();
      p.pos = p.pos + vec2(i * 2, 0);
      p.vel = vec2(150 + r * 50, -200 - rng() * 100);
      p.life = 2 + rng() * 2;
      p.size = 1 + (i - Math.floor(i / 3) * 3);
      p.wobble = rng() * 10 - 5;
    });
