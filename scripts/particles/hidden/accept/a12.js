import { particles } from "../particles.grammar.js";

// Compound assignment (+= -= *= /=) on number fields, built-in and declared.
export default ($) => particles("compound")
  .bounds({ width: 200, height: 200 })
  .maxParticles(150)
  .field("heat", { value: 2 })
  .field("spin", { value: 0 })
  .update((p, dt) => {
    p.heat -= dt;
    p.spin += 3 * dt;
    p.size *= 0.99;
    p.life /= 1.001;
    if (p.heat < 0) { p.kill(); }
  })
  .emitter("ember", { x: 100, y: 190, maxRate: 25 })
    .rate((t, live) => 25)
    .spawn((p, rng) => {
      p.heat += rng();
      p.size *= 2;
      p.vel = vec2(0, -40);
    });
