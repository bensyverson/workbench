import { particles } from "../particles.grammar.js";

// Minimal Program: only the required calls, one emitter, a zero-parameter rate.
export default ($) => particles("minimal")
  .bounds({ width: 100, height: 100 })
  .maxParticles(10)
  .emitter("dot", { x: 50, y: 50, maxRate: 5 })
    .rate(() => 5)
    .spawn((p) => { p.size = 2; });
