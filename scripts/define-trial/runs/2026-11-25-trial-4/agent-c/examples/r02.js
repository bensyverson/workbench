// REFUSED: L013 (sheet 4: a write to age, from an update)
import { particles } from "../particles.grammar.js";

export default ($) => particles("r02")
  .bounds({ width: 100, height: 100 })
  .maxParticles(10)
  .update((p, dt) => { p.age = 0; })
  .emitter("e", { x: 50, y: 50, maxRate: 5 })
    .rate((t, live) => 5)
    .spawn((p, rng) => { p.life = 2; });
