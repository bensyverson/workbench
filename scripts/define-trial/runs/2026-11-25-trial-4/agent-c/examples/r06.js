// REFUSED: L004 (sheet 24: a counter bumped in a rate lambda)
import { particles } from "../particles.grammar.js";

export default ($) => particles("r06")
  .bounds({ width: 100, height: 100 })
  .maxParticles(10)
  .counter("burnedOut")
  .emitter("e", { x: 50, y: 50, maxRate: 5 })
    .rate((t, live) => { counters.burnedOut++; return 5; })
    .spawn((p, rng) => { p.life = 2; });
