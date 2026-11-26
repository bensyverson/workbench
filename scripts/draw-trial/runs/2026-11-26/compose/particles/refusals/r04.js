// REFUSED: B013 (sheet 7: rng used in update, where the name means nothing)
import { particles } from "../particles.grammar.js";

export default ($) => particles("refusal")
  .bounds({ width: 400, height: 300 })
  .maxParticles(500)
  .field("heat", { value: 1 })
  .counter("burnedOut")
  .force("gravity", (p, dt) => { p.vel = p.vel + vec2(0, 300) * dt; })
  .update((p, dt) => { p.size = 1 + rng(); p.heat = p.heat - dt; })
  .emitter("jet", { x: 200, y: 290, maxRate: 400 })
    .rate((t, live) => (counters.burnedOut < 100 ? 60 : 0))
    .spawn((p, rng, i) => { p.vel = vec2(rng() - 0.5, -1) * 200; });
