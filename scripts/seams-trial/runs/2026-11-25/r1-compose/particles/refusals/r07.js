// REFUSED: R010 (a trigger names a value input)
import { particles } from "../particles.grammar.js";

export default ($) => particles("refusal")
  .bounds({ width: 400, height: 300 })
  .maxParticles(500)
  .emitter("jet", { x: 200, y: 290, maxRate: 0, trigger: "wind", count: 5 })
    .rate((t, live) => 0)
    .spawn((p, rng) => { p.life = 1; });
