import { particles } from "../particles.grammar.js";

// Effects driven from outside: sparks where a burst record lands, a trail that follows the anchor and thickens
// with intensity, and smoke that drifts with the wind.
export default ($) => particles("effects")
  .bounds({ width: 400, height: 300 })
  .maxParticles(600)
  .tick(1 / 30)
  .force("air", (p, dt) => { p.vel = p.vel + (inp.wind - p.vel) * dt; })
  .force("gravity", (p, dt) => { p.vel = p.vel + vec2(0, 200) * dt; })
  .emitter("sparks", { x: 200, y: 150, maxRate: 0, on: "burst", count: 30, forces: ["gravity"] })
    .rate((t, live) => 0)
    .spawn((p, rng) => {
      p.vel = vec2(rng() - 0.5, rng() - 0.5) * 120;
      p.life = 0.5 + rng() * 0.5;
      p.size = 2;
    })
  .emitter("trail", { x: 200, y: 280, maxRate: 90, follow: "anchor", forces: ["air"] })
    .rate((t, live) => 30 * inp.intensity)
    .spawn((p, rng) => {
      p.vel = vec2((rng() - 0.5) * 20, -30);
      p.life = 1 + rng();
    });
