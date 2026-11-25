import { particles } from "../particles.grammar.js";

// Params read at build time inside the chain, after their .param calls:
// maxParticles, an emitter's x and maxRate. The same params are read in lambdas.
export default ($) => particles("tuned")
  .param("cap", { value: 300, min: 1, max: 1000 })
  .param("peak", { value: 150, min: 0, max: 500 })
  .param("origin", { value: 120, min: 0, max: 240 })
  .bounds({ width: 240, height: 240 })
  .maxParticles($.cap)
  .emitter("fixed", { x: $.origin, y: 120, maxRate: $.peak })
    .rate((t, live) => (live < $.cap ? $.peak : 0))
    .spawn((p, rng) => { p.vel = vec2(rng() * 50, rng() * 50); });
