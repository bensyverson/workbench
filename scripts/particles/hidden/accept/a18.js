import { particles } from "../particles.grammar.js";

// Several params read across lambdas; a force reading declared fields;
// ternaries and number comparisons; seed 0; tick 1/20; several fields.
export default ($) => particles("smoke")
  .param("lift", { value: 40, min: 0, max: 200 })
  .param("spread", { value: 30, min: 0, max: 100 })
  .param("density", { value: 50, min: 0, max: 300 })
  .bounds({ width: 400, height: 400 })
  .maxParticles(1500)
  .tick(1 / 20)
  .seed(0)
  .field("buoyancy", { value: 1 })
  .field("drift", { value: 0 })
  .force("lift", (p, dt) => {
    p.vel = p.vel + vec2(p.drift, -$.lift * p.buoyancy) * dt;
  })
  .update((p, dt) => {
    p.buoyancy = p.age >= 1 ? 0.5 : 1;
    p.size = p.size + dt * 2;
  })
  .emitter("chimney", { x: 200, y: 390, maxRate: 300 })
    .rate((t, live) => (t <= 1 ? $.density / 2 : $.density))
    .spawn((p, rng) => {
      p.drift = (rng() - 0.5) * $.spread;
      p.life = 4;
    });
