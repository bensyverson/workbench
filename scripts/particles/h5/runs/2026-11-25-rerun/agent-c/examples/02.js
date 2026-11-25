import { particles } from "../particles.grammar.js";

export default ($) => particles("")
  .emitter("one", { x: 5, y: 5, maxRate: 10 })
    .rate((t) => (t < 1 ? 10 : 0))
    .spawn((p) => { p.life = 2; })
  .bounds({ width: 10, height: 10 })
  .maxParticles(10);
