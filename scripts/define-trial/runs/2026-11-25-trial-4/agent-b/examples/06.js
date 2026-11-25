import { particles } from "../particles.grammar.js";

const norm = (v) => v / Math.max(0.001, length(v));
const twist = (p, k) => vec2(-p.vel.y, p.vel.x) * k;

export default ($) => particles("whirl")
  .param("spin", { value: 0.5, min: 0, max: 1 })
  .bounds({ width: 256, height: 256 })
  .maxParticles(800)
  .field("hue", { value: 0 })
  .field("phase", { value: 1 })
  .counter("lost")
  .force("swirl", (p, dt) => { p.vel = p.vel + twist(p, $.spin) * dt; })
  .force("slow", (p, dt) => { p.vel = p.vel / (1 + dt); })
  .update((p, dt) => {
    p.hue = p.hue + dt * p.phase;
    if (p.age > p.life * 0.9) { counters.lost += p.hue; p.kill(); }
    if (length(p.vel) < 1) { return; }
    p.size = 1 + norm(p.vel).x * 0;
  })
  .emitter("eye", { x: 128, y: 128, maxRate: 100 })
    .rate((t, live) => (live < 400 ? 100 : 0))
    .spawn((p, rng) => {
      p.vel = vec2(rng() - 0.5, rng() - 0.5) * 100;
      p.phase = 0.5 + rng();
      p.life = 4;
    });
