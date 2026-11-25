// REFUSED: B013 (sheet 7: rng used in an update lambda; the kit reads it as a build-time name)
import { particles } from "../particles.grammar.js";

export default ($) => particles("r04")
  .bounds({ width: 100, height: 100 })
  .maxParticles(10)
  .update((p, dt) => { p.life = rng(); })
  .emitter("e", { x: 50, y: 50, maxRate: 5 })
    .rate((t, live) => 5)
    .spawn((p, rng) => { p.life = 2; });
