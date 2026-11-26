import { particles } from "../particles.grammar.js";

// Snow: a seed, an emitter that no force acts on, a sway force only one emitter lists.
const SWAY = 15;

export default ($) => particles("snow")
  .bounds({ width: 400, height: 300 })
  .maxParticles(2000)
  .seed(7)
  .tick(0.05)
  .field("phase", { value: 0 })
  .force("sway", (p, dt) => { p.vel = vec2(Math.sin(p.phase + p.age) * SWAY, p.vel.y); })
  .emitter("flakes", { x: 200, y: 0, maxRate: 80, forces: ["sway"] })
    .rate((t, live) => 40)
    .spawn((p, rng) => {
      p.pos = vec2(rng() * 400, 0);
      p.vel = vec2(0, 20 + rng() * 10);
      p.phase = rng() * 2 * Math.PI;
      p.life = 20;
    })
  .emitter("still", { x: 10, y: 10, maxRate: 1, forces: [] })
    .rate((t, live) => (live < 1 ? 1 : 0))
    .spawn((p, rng) => { p.life = 1000; });
