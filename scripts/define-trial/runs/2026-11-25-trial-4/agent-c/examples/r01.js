// REFUSED: L004 (sheet 3: a force writes p.size)
import { particles } from "../particles.grammar.js";

export default ($) => particles("r01")
  .bounds({ width: 100, height: 100 })
  .maxParticles(10)
  .force("grow", (p, dt) => { p.size = p.size + dt; })
  .emitter("e", { x: 50, y: 50, maxRate: 5, forces: ["grow"] })
    .rate((t, live) => 5)
    .spawn((p, rng) => { p.life = 2; });
