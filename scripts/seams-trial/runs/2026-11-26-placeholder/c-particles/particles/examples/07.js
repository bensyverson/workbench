import { particles } from "../particles.grammar.js";

// Pops: a burst wherever a record arrives, embers drifting from input.target, all blown by input.wind.
const ring = (k, n, speed) => vec2(Math.cos((k / n) * 2 * Math.PI), Math.sin((k / n) * 2 * Math.PI)) * speed;

export default ($) => particles("pops")
  .param("speed", { value: 60, min: 10, max: 200 })
  .bounds({ width: 400, height: 300 })
  .maxParticles(1000)
  .tick(1 / 30)
  .force("air", (p, dt) => { p.vel = p.vel + (input.wind - p.vel) * dt; })
  .update((p, dt) => { p.size = Math.max(1, 4 * (1 - p.age / p.life)); })
  .emitter("pop", { x: 200, y: 150, maxRate: 0, on: "burst", burst: 24 })
    .rate((t, live) => 0)
    .spawn((p, rng, i) => {
      p.pos = burst.pos;
      p.vel = ring(i % 24, 24, $.speed * (0.8 + 0.4 * rng()));
      p.life = 0.5 + rng() * 0.5;
    })
  .emitter("embers", { x: 200, y: 280, maxRate: 40 })
    .rate((t, live) => 10 * input.intensity)
    .spawn((p, rng) => {
      p.pos = p.pos + (input.target - p.pos) * rng() * 0.1;
      p.vel = vec2((rng() - 0.5) * 20, -30);
      p.life = 2;
    });
