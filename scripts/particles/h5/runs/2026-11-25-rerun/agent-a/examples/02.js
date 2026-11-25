import { particles } from "../particles.grammar.js";

// Smoke: forward references, an empty forces list, a pure rate with a helper.
const RISE = 20;
const wave = (t) => Math.sin(t * Math.PI) * 0.5 + 0.5;

export default ($) => particles("smoke stack #2")
  .emitter("puff", { x: 0, y: 100, maxRate: 30, forces: ["buoyancy"] })
    .rate((t) => 30 * wave(t))
    .spawn((p, rng) => {
      p.vel = vec2(rng() * 4 - 2, 0);
      p.size = 2;
      p.life = 4;
    })
  .emitter("still", { x: 100, y: 100, maxRate: 0, forces: [] })
    .rate((t, live) => (live === 0 ? 1 : 0))
    .spawn((p) => {
      p.size = 1;
    })
  .force("buoyancy", (p, dt) => {
    p.vel = vec2(p.vel.x, p.vel.y - RISE * dt);
  })
  .bounds({ width: 100, height: 100 })
  .maxParticles(10000)
  .tick(0.05)
  .param("wind", { value: 0, min: -10, max: 10 });
