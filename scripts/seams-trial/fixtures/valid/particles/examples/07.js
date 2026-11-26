import { particles } from "../particles.grammar.js";

// A burst: the "pop" emitter fires only when its trigger input delivers a record, spreading by the radius input.
export default ($) => particles("pops")
  .bounds({ width: 320, height: 320 })
  .maxParticles(400)
  .update((p, dt) => { p.vel = p.vel * (1 - 2 * dt); })
  .emitter("pop", { x: 160, y: 160, maxRate: 24, trigger: "burst" })
    .rate((t, live) => 0)
    .spawn((p, rng) => {
      p.vel = vec2(rng() - 0.5, rng() - 0.5) * inp.radius * 4;
      p.life = 0.6 + rng() * 0.3;
    });
