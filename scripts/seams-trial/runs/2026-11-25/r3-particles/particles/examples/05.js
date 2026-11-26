import { particles } from "../particles.grammar.js";

// Firework: a helper returning a vector, a let vector changed by component, a counter read by rate.
const BURST = 60;
const ring = (k, n, speed) => vec2(Math.cos((k / n) * 2 * Math.PI), Math.sin((k / n) * 2 * Math.PI)) * speed;

export default ($) => particles("firework")
  .param("speed", { value: 120, min: 10, max: 300 })
  .bounds({ width: 400, height: 400 })
  .maxParticles(1000)
  .counter("bursts")
  .force("gravity", (p, dt) => { p.vel = p.vel + vec2(0, 60) * dt; })
  .update((p, dt) => {
    let v = p.vel;
    v.x = v.x * 0.99;
    p.vel = v;
    if (p.age > p.life - 0.1) { counters.bursts++; }
  })
  .emitter("shell", { x: 200, y: 200, maxRate: 600 })
    .rate((t, live) => (counters.bursts < 10 && live === 0 ? 600 : 0))
    .spawn((p, rng, i) => {
      p.vel = ring(i % BURST, BURST, $.speed * (0.8 + 0.4 * rng()));
      p.life = 2;
    });
