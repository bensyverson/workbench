import { particles } from "../particles.grammar.js";

const CAP = 30;

export default ($) => particles("rain")
  .param("cap", { value: 30, min: 1, max: 60 })
  .param("wind", { value: 0, min: -20, max: 20 })
  .bounds({ width: 100, height: 100 })
  .maxParticles(120)
  .counter("rained")
  .counter("splashes")
  .field("drop", { value: 0 })
  .force("wind", (p, dt) => { p.vel = vec2(p.vel.x + $.wind * dt, p.vel.y); })
  .force("gravity", (p, dt) => { p.vel = vec2(p.vel.x, p.vel.y + 90 * dt); })
  .update((p, dt) => {
    p.drop = p.drop + dt;
    if (p.pos.y >= 99 && p.drop !== 0) { p.kill(); counters.splashes++; }
    else if (p.drop > 2 || p.pos.x < 0) { p.kill(); }
  })
  .emitter("drops", { x: 50, y: 0, maxRate: 25, forces: ["gravity", "wind"] })
    .rate((t, live) => (live < $.cap && counters.rained < 1000 ? 25 : 0))
    .spawn((p, rng, i) => {
      p.pos = vec2(rng() * 100, 0);
      p.life = 10;
      counters.rained += p.size;
    })
  .emitter("mist", { x: 20, y: 0, maxRate: 5, forces: [] })
    .rate((t, live) => {
      if (t > 5) { return 0; }
      return 5;
    })
    .spawn((p) => { p.pos = vec2(20, 0); });
