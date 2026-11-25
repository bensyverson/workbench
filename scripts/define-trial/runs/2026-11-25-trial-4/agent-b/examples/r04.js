// REFUSED: B008 (sheet 7: rng used in update)
import { particles } from "../particles.grammar.js";

export default ($) => particles("r")
  .bounds({ width: 100, height: 100 })
  .maxParticles(100)
  .counter("hits")
  .force("f", (p, dt) => { p.vel = p.vel * 0.9; })
  .update((p, dt) => { p.life = rng(); })
  .emitter("e", { x: 50, y: 50, maxRate: 10 })
    .rate((t, live) => 5)
    .spawn((p, r, i) => { p.life = r(); });
