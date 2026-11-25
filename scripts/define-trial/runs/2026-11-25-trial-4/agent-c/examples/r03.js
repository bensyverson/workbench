// REFUSED: L004 (sheet 6: p.kill() in a spawn lambda)
import { particles } from "../particles.grammar.js";

export default ($) => particles("r03")
  .bounds({ width: 100, height: 100 })
  .maxParticles(10)
  .emitter("e", { x: 50, y: 50, maxRate: 5 })
    .rate((t, live) => 5)
    .spawn((p, rng) => { p.kill(); });
