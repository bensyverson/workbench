import { particles } from "../particles.grammar.js";
const twice = (x) => { let s = x; s = s * 2; return s; };
const CAP = 4;
const bob = (v) => vec2(Math.sin(v.x) * 2, -length(v) / CAP);

export default ($) => particles("bob")
  .param("speed", { value: 1, min: 0, max: 3 })
  .bounds({ width: 100, height: 100 })
  .maxParticles(50)
  .seed(7)
  .field("phase", { value: 0 })
  .force("sway", (p, dt) => { p.vel = p.vel + bob(p.vel) * dt * $.speed; })
  .update((p, dt) => {
    p.phase = twice(p.phase) / 2 + dt;
    p.size = Math.abs(Math.cos(p.phase)) + 1;
    if (p.age > 10) { p.kill(); }
  })
  .emitter("spray", { x: 50, y: 99, maxRate: 10, forces: ["sway"] })
    .rate((t, live) => (live < 20 ? 10 : 0))
    .spawn((p, rng) => { p.vel = vec2(rng() - 0.5, -5); p.life = 12; });
