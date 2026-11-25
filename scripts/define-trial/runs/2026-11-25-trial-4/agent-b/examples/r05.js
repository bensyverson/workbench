// REFUSED: L017 (sheet 23: update reads a counter)
import { particles } from "../particles.grammar.js";

export default ($) => particles("r")
  .bounds({ width: 100, height: 100 })
  .maxParticles(100)
  .counter("hits")
  .force("f", (p, dt) => { p.vel = p.vel * 0.9; })
  .update((p, dt) => { if (counters.hits > 3) { p.life = 1; } })
  .emitter("e", { x: 50, y: 50, maxRate: 10 })
    .rate((t, live) => 5)
    .spawn((p, rng, i) => { p.life = 1; });
