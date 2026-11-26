// REFUSED: R010 (an emitter's trigger names a value input; only an Event input can trigger an emitter)
import { particles } from "../particles.grammar.js";

export default ($) => particles("refusal")
  .bounds({ width: 400, height: 300 })
  .maxParticles(500)
  .emitter("pop", { x: 200, y: 150, maxRate: 50, trigger: "level" })
    .rate((t, live) => 20)
    .spawn((p, rng) => { p.vel = vec2(rng() - 0.5, -1) * 100; });
