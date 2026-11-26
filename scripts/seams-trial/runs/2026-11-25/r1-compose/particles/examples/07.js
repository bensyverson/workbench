import { particles } from "../particles.grammar.js";

// Driven from outside: sparks where a burst says, a puff on each pulse, a jet scaled by intensity,
// all blown by wind and drawn toward target. Unwired, only the jet runs.
export default ($) => particles("driven")
  .param("pull", { value: 0, min: 0, max: 2 })
  .bounds({ width: 400, height: 300 })
  .maxParticles(1000)
  .force("air", (p, dt) => { p.vel = p.vel + (inp.wind - p.vel) * dt; })
  .force("draw", (p, dt) => { p.vel = p.vel + (inp.target - p.pos) * $.pull * dt; })
  .emitter("jet", { x: 200, y: 290, maxRate: 100 })
    .rate((t, live) => 30 * Math.max(0, inp.intensity))
    .spawn((p, rng) => { p.vel = vec2((rng() - 0.5) * 40, -150); p.life = 2; })
  .emitter("sparks", { x: 200, y: 150, maxRate: 0, trigger: "burst", count: 24 })
    .rate((t, live) => 0)
    .spawn((p, rng) => { p.vel = vec2(rng() - 0.5, rng() - 0.5) * 200 * inp.intensity; p.life = 0.8; })
  .emitter("puff", { x: 40, y: 40, maxRate: 0, trigger: "pulse", count: 8 })
    .rate((t, live) => 0)
    .spawn((p, rng) => { p.vel = vec2((rng() - 0.5) * 60, (rng() - 0.5) * 60); p.life = 1; });
