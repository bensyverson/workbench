// REFUSED: L004 (sheet 24: a rate lambda bumps a counter)
import { particles } from "../particles.grammar.js";

export default ($) => particles("refusal")
  .bounds({ width: 400, height: 300 })
  .maxParticles(500)
  .field("heat", { value: 1 })
  .counter("burnedOut")
  .force("gravity", (p, dt) => { p.vel = p.vel + vec2(0, 300) * dt; })
  .update((p, dt) => { p.heat = p.heat - dt; if (p.heat < 0) { p.kill(); counters.burnedOut++; } })
  .emitter("jet", { x: 200, y: 290, maxRate: 400 })
    .rate((t, live) => { counters.burnedOut++; return 60; })
    .spawn((p, rng, i) => { p.vel = vec2(rng() - 0.5, -1) * 200; });
