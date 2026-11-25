// REFUSED: L013 (sheet 4: update writes p.age)
import { particles } from "../particles.grammar.js";

export default ($) => particles("r")
  .bounds({ width: 100, height: 100 })
  .maxParticles(100)
  .counter("hits")
  .force("f", (p, dt) => { p.vel = p.vel * 0.9; })
  .update((p, dt) => { p.age = 0; })
  .emitter("e", { x: 50, y: 50, maxRate: 10 })
    .rate((t, live) => 5)
    .spawn((p, rng, i) => { p.life = 1; });
