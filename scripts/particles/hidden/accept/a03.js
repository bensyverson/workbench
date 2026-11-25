import { particles } from "../particles.grammar.js";

// One-parameter rate, explicit tick and seed, update that kills.
export default ($) => particles("burst")
  .bounds({ width: 320, height: 240 })
  .maxParticles(300)
  .tick(1 / 60)
  .seed(7)
  .update((p, dt) => {
    p.size = p.size * (1 - dt);
    if (p.size < 0.1) { p.kill(); }
  })
  .emitter("pop", { x: 160, y: 120, maxRate: 200 })
    .rate((t) => (t < 2 ? 200 : 0))
    .spawn((p, rng) => {
      p.vel = vec2(rng() * 200 - 100, rng() * 200 - 100);
      p.life = 2;
    });
