import { particles } from "../particles.grammar.js";

// One name may be shared across kinds: a param, a force, a field, a counter and an emitter called wind.
export default ($) => particles("wind")
  .emitter("wind", { x: 100, y: 50, maxRate: 30, forces: ["wind"] })
    .rate((t) => $.wind + Math.sin(t))
    .spawn((p, rng) => { p.wind = rng(); p.life = 2; })
  .force("wind", (p, dt) => { p.vel = p.vel + vec2($.wind * p.wind, 0) * dt; })
  .param("wind", { value: 10, min: -20, max: 20 })
  .field("wind", { value: 0 })
  .counter("wind")
  .update((p) => { if (p.age > 1) { counters.wind += p.wind; } })
  .bounds({ width: 100, height: 100 })
  .maxParticles(50);
