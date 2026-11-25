import { particles } from "../particles.grammar.js";
export default ($) => particles("t")
  .bounds({ width: 400, height: 300 })
  .maxParticles(500)
  .param("cap", { value: 10, min: 1, max: 50 })
  .field("heat", { value: 1 })
  .counter("burnedOut")
  .force("drag", (p, dt) => { p.vel = p.vel * (1 - 0.5 * dt); })
  .emitter("jet", { x: 200, y: 290, maxRate: 10 })
    .rate((t, live) => 1)
    .spawn((p, rng) => { let v = p.vel; v.x = 0; p.life = 1; });
