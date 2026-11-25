import { particles } from "../particles.grammar.js";

// Declared but never called: it is still checked, and the Program must not care.
const radialSpeed = (p) => length(p.vel);

export default ($) => particles("ring")
  .param("pull", { value: 2, min: 0, max: 10 })
  .bounds({ width: 200, height: 200 })
  .maxParticles(400)
  .tick(0.02)
  .seed(42)
  .field("spin", { value: 0 })
  .force("pull", (p, dt) => {
    const d = p.pos - vec2(100, 100);
    p.vel = p.vel - d * ($.pull * dt);
  })
  .force("drag", (p, dt) => { p.vel = p.vel * (1 - 0.2 * dt); })
  .update((p, dt) => {
    p.spin = p.spin + dt * 3;
    p.size = Math.max(0.5, Math.min(3, p.age * 2));
    if (length(p.vel) < 1) { p.kill(); }
  })
  .emitter("ring", { x: 100, y: 40, maxRate: 90, forces: ["pull", "drag"] })
    .rate((t, live) => (t < 10 ? 90 : 0))
    .spawn((p, rng) => {
      const a = rng() * 2 * Math.PI;
      p.pos = vec2(100 + Math.cos(a) * 60, 100 + Math.sin(a) * 60);
      p.vel = vec2(-Math.sin(a) * 30, Math.cos(a) * 30);
      p.life = 6;
    });
