// REFUSED: L004 (sheet 24: rate bumps a counter)
import { particles } from "../particles.grammar.js";

export default ($) => particles("r")
  .bounds({ width: 100, height: 100 })
  .maxParticles(100)
  .counter("hits")
  .force("f", (p, dt) => { p.vel = p.vel * 0.9; })
  .update((p, dt) => { p.life = 1; })
  .emitter("e", { x: 50, y: 50, maxRate: 10 })
    .rate((t, live) => { counters.hits++; return 5; })
    .spawn((p, rng, i) => { p.life = 1; });
