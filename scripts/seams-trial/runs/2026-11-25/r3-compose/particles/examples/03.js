import { particles } from "../particles.grammar.js";

// Sparks: a fixed loop inside spawn, an early return in update, a kill counted by size.
const STEPS = 3;

export default ($) => particles("sparks")
  .param("heatLoss", { value: 2, min: 0, max: 10 })
  .bounds({ width: 200, height: 200 })
  .maxParticles(300)
  .tick(1 / 60)
  .field("heat", { value: 1 })
  .counter("ash")
  .force("gravity", (p, dt) => { p.vel = p.vel + vec2(0, 200) * dt; })
  .update((p, dt) => {
    p.heat = p.heat - $.heatLoss * dt;
    if (p.heat > 0) { return; }
    counters.ash += p.size;
    p.kill();
  })
  .emitter("anvil", { x: 100, y: 100, maxRate: 120 })
    .rate((t, live) => (Math.sin(t * 3) > 0 ? 120 : 0))
    .spawn((p, rng, i) => {
      let a = 0;
      for (let k = 0; k < STEPS; k++) { a += rng(); }
      const angle = (a / STEPS) * 2 * Math.PI;
      p.vel = vec2(Math.cos(angle), Math.sin(angle)) * 150;
      p.size = 1 + (i % 2);
    });
