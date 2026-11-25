import { particles } from "../particles.grammar.js";

// Smoke: three vents built in a loop, a helper that reads a particle, a counter bumped at spawn.
const RISE = 40;
const fade = (p) => Math.max(0, 1 - p.age / p.life);

export default ($) => {
  const sys = particles("smoke")
    .param("vents", { value: 3, min: 1, max: 5 })
    .param("puff", { value: 12, min: 0, max: 50 })
    .bounds({ width: 300, height: 200 })
    .maxParticles(800)
    .field("opacity", { value: 1 })
    .counter("spawned")
    .force("rise", (p, dt) => { p.vel = p.vel + vec2(0, -RISE) * dt; })
    .update((p, dt) => {
      p.opacity = fade(p);
      p.size = p.size + dt * 4;
    });
  for (let k = 0; k < $.vents; k++) {
    sys.emitter("vent" + k, { x: 50 + k * 50, y: 190, maxRate: 50 })
      .rate((t, live) => (counters.spawned < 5000 ? $.puff : 0))
      .spawn((p, rng) => {
        p.vel = vec2((rng() - 0.5) * 10, -20);
        p.life = 2 + rng() * 2;
        counters.spawned++;
      });
  }
  return sys;
};
