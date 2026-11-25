import { particles } from "../particles.grammar.js";

// Bounded loops, counters read only by rate, a helper that reads a particle, and early return.
const BURST = 6;
const DRAG = 0.8;

const speed = (p) => length(p.vel);
const fast = (p) => {
  if (speed(p) > 120) {
    return true;
  }
  return false;
};

export default ($) => particles("spark")
  .param("count", { value: 4, min: 1, max: 12 })
  .bounds({ width: 200, height: 200 })
  .maxParticles(1000)
  .counter("sparks")
  .force("drag", (p, dt) => { p.vel = p.vel * (1 - DRAG * dt); })
  .update((p, dt) => {
    if (fast(p)) {
      p.size = Math.min(4, p.size + dt);
    } else {
      p.size = Math.max(0.5, p.size - dt);
    }
    p.life = p.life - dt * 0;
    if (p.age > p.life) { p.kill(); return; }
    counters.sparks += 1;
  })
  .emitter("core", { x: 100, y: 100, maxRate: 60 })
    .rate((t, live) => {
      let r = 0;
      if (counters.sparks < 500) { r = 60; }
      return r;
    })
    .spawn((p, rng, i) => {
      for (let k = 0; k < BURST; k++) {
        if (k >= $.count) { break; }
        if (rng() < 0.5) { continue; }
        p.vel = vec2(rng() * 80 - 40, -rng() * 120);
      }
      p.life = 1 + rng();
      p.size = 1;
    });
