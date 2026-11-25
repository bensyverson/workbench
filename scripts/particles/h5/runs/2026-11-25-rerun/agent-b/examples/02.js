import { particles } from "../particles.grammar.js";

// Smoke: chained reassignment, a param and a force sharing a name, forces: [].
const RISE = 40;

export default ($) => {
  let s = particles("smoke");
  s = s.bounds({ width: 64.5, height: 4096 }).maxParticles(10000);
  s = s.param("wind", { value: 0, min: 0, max: 0 });
  s = s.force("wind", (p, dt) => { p.vel = p.vel + vec2($.wind, -RISE) * dt; });
  s = s.emitter("still", { x: 0, y: 4096, maxRate: 0, forces: [] })
    .rate((t) => 0)
    .spawn((p) => { p.size = 4; });
  s = s.emitter("puff", { x: 64.5, y: 0, maxRate: 1e6 })
    .rate((t, live) => Math.min(live, 10, 20))
    .spawn((p, rng) => {
      const a = rng() * Math.PI * 2;
      p.vel = vec2(Math.cos(a), Math.sin(a)) * 5;
      p.pos = p.pos + -p.vel;
    });
  return s;
};
