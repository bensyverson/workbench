import { particles } from "../particles.grammar.js";
const kick = (q) => q.vel.x > 0;
const lift = (q) => vec2(q.vel.x / 2, -q.vel.y);
export default ($) => particles("my fountain! 1")
  .bounds({ width: 400, height: 300 })
  .maxParticles(500)
  .param("cap", { value: 10, min: 1, max: 50 })
  .field("heat", { value: 1 })
  .counter("burnedOut")
  .force("drag", (p, dt) => { p.vel = p.vel * (1 - 0.5 * dt); })
  .emitter("jet", { x: 200, y: 290, maxRate: 10 })
    .rate((t, live) => counters.burnedOut * 2 + Math.floor($.cap / 2) + Math.PI)
    .spawn((p, rng) => { if (kick(p)) { return; } p.vel = lift(p); p.life = length(p.vel) + Math.sqrt(2); })
  .update((p, dt) => { if (p.life < 0.5) { p.kill(); } counters.burnedOut += p.size; });
