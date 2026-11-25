import { particles } from "../particles.grammar.js";

// `forces: []`: no force acts on that emitter's particles. Beside it, an
// emitter with no list (every force acts) and one whose list is in reverse
// declaration order (forces still run in declaration order).
export default ($) => particles("no-forces")
  .bounds({ width: 400, height: 200 })
  .maxParticles(300)
  .force("gravity", (p, dt) => { p.vel = p.vel + vec2(0, 100) * dt; })
  .force("drag", (p, dt) => { p.vel = p.vel * (1 - 0.2 * dt); })
  .emitter("still", { x: 100, y: 100, maxRate: 20, forces: [] })
    .rate(() => 20)
    .spawn((p, rng) => { p.vel = vec2(rng() * 10 - 5, 0); })
  .emitter("falling", { x: 200, y: 20, maxRate: 20 })
    .rate(() => 20)
    .spawn((p) => { p.life = 2; })
  .emitter("reversed", { x: 300, y: 20, maxRate: 20, forces: ["drag", "gravity"] })
    .rate(() => 20)
    .spawn((p) => { p.size = 2; });
