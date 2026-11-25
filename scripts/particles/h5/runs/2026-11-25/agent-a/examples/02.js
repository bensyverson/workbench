import { particles } from "../particles.grammar.js";

// Smoke: no forces act on the puffs (forces: []), a forward-referenced force, rate with a block body.
const RISE = -40;

export default ($) => {
  let sys = particles("smoke")
    .bounds({ width: 100, height: 100 })
    .maxParticles(200)
    .tick(0.05);
  sys = sys.emitter("chimney", { x: 50, y: 100, maxRate: 10, forces: ["lift"] })
    .rate((t, live) => {
      if (t < 1) {
        return 2;
      } else if (live > 50) {
        return 0;
      }
      return 10;
    })
    .spawn((p, rng) => {
      p.vel = vec2(0, RISE);
      p.life = 2 + rng() * 2;
      p.size = 2;
    });
  sys = sys.emitter("puff", { x: 0, y: 0, maxRate: 0, forces: [] })
    .rate((t) => 0)
    .spawn((p) => { p.size = 4; });
  sys = sys.force("lift", (p, dt) => { p.vel = vec2(p.vel.x * 0.9, p.vel.y - 5 * dt); });
  return sys;
};
