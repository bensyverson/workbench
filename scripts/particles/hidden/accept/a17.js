import { particles } from "../particles.grammar.js";

// Lambdas declaring fewer parameters than their slot gives:
// force (p), update (p), spawn (p), rate ().
export default ($) => particles("fewer")
  .bounds({ width: 200, height: 200 })
  .maxParticles(50)
  .force("stop", (p) => { p.vel = p.vel * 0.5; })
  .update((p) => {
    if (p.age > 2) { p.kill(); }
  })
  .emitter("e", { x: 100, y: 100, maxRate: 10 })
    .rate(() => 10)
    .spawn((p) => { p.vel = vec2(5, 0); });
