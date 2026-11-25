// REFUSED: L017 (sheet 23: a counter read in an update lambda)
import { particles } from "../particles.grammar.js";

export default ($) => particles("r05")
  .bounds({ width: 100, height: 100 })
  .maxParticles(10)
  .counter("burnedOut")
  .update((p, dt) => { if (counters.burnedOut > 3) { p.kill(); } })
  .emitter("e", { x: 50, y: 50, maxRate: 5 })
    .rate((t, live) => 5)
    .spawn((p, rng) => { p.life = 2; });
