import { particles } from "../particles.grammar.js";

const MAX_SIZE = 6;
const clampSize = (s) => Math.min(MAX_SIZE, Math.max(1, s));

export default ($) => particles("smoke")
  .param("lift", { value: 40, min: 0, max: 100 })
  .bounds({ width: 300, height: 400 })
  .maxParticles(2000)
  .tick(1 / 20)
  .field("puff", { value: 0.5 })
  .counter("born")
  .force("rise", (p, dt) => { p.vel = p.vel - vec2(0, $.lift) * dt; })
  .update((p, dt) => {
    p.size = clampSize(p.size + dt * 2);
    p.puff = p.puff * 0.99;
  })
  .emitter("stack", { x: 150, y: 390, maxRate: 50 })
    .rate((t, live) => 30 - live * 0.1)
    .spawn((p, rng, i) => {
      p.pos = p.pos + vec2(i * 2, 0);
      p.life = 3 + rng() * 2;
      p.size = 1;
      counters.born++;
    });
