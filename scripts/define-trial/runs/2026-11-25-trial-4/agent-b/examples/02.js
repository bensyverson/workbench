import { particles } from "../particles.grammar.js";

const TAU = 6.283185307179586;
const ring = (r, k) => vec2(Math.cos(k * TAU), Math.sin(k * TAU)) * r;
const speedOf = (p) => length(p.vel);

export default ($) => particles("sparks")
  .param("burst", { value: 30, min: 0, max: 200 })
  .bounds({ width: 200, height: 200 })
  .maxParticles(1000)
  .seed(7)
  .field("fade", { value: 0 })
  .counter("fast")
  .force("float", (p, dt) => { p.vel = p.vel - vec2(0, 20) * dt; })
  .update((p, dt) => {
    p.fade = p.fade + dt;
    if (speedOf(p) > 100) { counters.fast += p.size; }
    if (p.fade > 2) { p.kill(); }
  })
  .emitter("core", { x: 100, y: 100, maxRate: 200, forces: [] })
    .rate((t, live) => (t < 1 ? $.burst : 0))
    .spawn((p, rng, i) => {
      p.vel = ring(40 + rng() * 80, rng());
      p.life = 2;
    });
