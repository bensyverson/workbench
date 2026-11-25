import { particles } from "../particles.grammar.js";

// Several emitters: one with a two-force list, one with a one-force list,
// one with no forces list (every force acts).
export default ($) => particles("three")
  .param("wind", { value: 20, min: -100, max: 100 })
  .bounds({ width: 600, height: 400 })
  .maxParticles(2000)
  .force("gravity", (p, dt) => { p.vel = p.vel + vec2(0, 200) * dt; })
  .force("wind", (p, dt) => { p.vel = p.vel + vec2($.wind, 0) * dt; })
  .force("drag", (p, dt) => { p.vel = p.vel * (1 - 0.2 * dt); })
  .emitter("left", { x: 100, y: 300, maxRate: 100, forces: ["gravity", "drag"] })
    .rate((t, live) => 50)
    .spawn((p, rng) => { p.vel = vec2(0, -150 - rng() * 50); })
  .emitter("middle", { x: 300, y: 200, maxRate: 100, forces: ["wind"] })
    .rate((t, live) => (live > 100 ? 0 : 80))
    .spawn((p, rng) => { p.vel = vec2(rng() * 10, rng() * 10); p.size = 2; })
  .emitter("right", { x: 500, y: 100, maxRate: 30 })
    .rate((t, live) => 30)
    .spawn((p, rng, i) => { p.life = 3 + i * 0.01; });
