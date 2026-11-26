import { particles } from "../particles.grammar.js";

// Bursts: an emitter driven by the 'burst' input, spread by the radius input. Each burst record places its particles at
// the record's point, and spawn scatters them within inp.radius of it.
export default ($) => particles("bursts")
  .bounds({ width: 320, height: 256 })                      // the box particles live in (the px frame)
  .maxParticles(400)
  .tick(1 / 30)
  .force("drag", (p, dt) => { p.vel = p.vel * (1 - 2 * dt); })
  .update((p, dt) => { if (p.age > p.life) { p.kill(); } })
  .emitter("pop", { x: 160, y: 128, maxRate: 200, forces: ["drag"], trigger: "burst" })
    .rate((t, live) => 40)
    .spawn((p, rng) => {
      p.pos = p.pos + vec2((rng() - 0.5) * 2 * inp.radius, (rng() - 0.5) * 2 * inp.radius);
      p.vel = vec2((rng() - 0.5) * 60, (rng() - 0.5) * 60);
      p.life = 0.8 + rng() * 0.4;
    });
