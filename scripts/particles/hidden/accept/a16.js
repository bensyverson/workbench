import { particles } from "../particles.grammar.js";

// Emitters on the bounds' corners (edges included), and one with maxRate 0.
export default ($) => particles("edges")
  .bounds({ width: 400, height: 300 })
  .maxParticles(100)
  .emitter("topLeft", { x: 0, y: 0, maxRate: 10 })
    .rate(() => 10)
    .spawn((p) => { p.vel = vec2(10, 10); })
  .emitter("bottomRight", { x: 400, y: 300, maxRate: 10 })
    .rate(() => 10)
    .spawn((p) => { p.vel = vec2(-10, -10); })
  .emitter("idle", { x: 400, y: 0, maxRate: 0 })
    .rate(() => 0)
    .spawn((p) => { p.size = 1; });
