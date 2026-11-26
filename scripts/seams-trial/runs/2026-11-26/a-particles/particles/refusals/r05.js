// REFUSED: L017 (sheet 23: update reads a counter)
import { particles } from "../particles.grammar.js";

export default ($) => particles("refusal")
  .bounds({ width: 400, height: 300 })
  .maxParticles(500)
  .field("heat", { value: 1 })
  .counter("burnedOut")
  .force("gravity", (p, dt) => { p.vel = p.vel + vec2(0, 300) * dt; })
  .update((p, dt) => { p.heat = p.heat - dt; if (counters.burnedOut > 3) { p.kill(); } })
  .emitter("jet", { x: 200, y: 290, maxRate: 400 })
    .rate((t, live) => (counters.burnedOut < 100 ? 60 : 0))
    .spawn((p, rng, i) => { p.vel = vec2(rng() - 0.5, -1) * 200; });
