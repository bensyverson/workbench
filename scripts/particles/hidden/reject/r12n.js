// REJECT 12: helpers called with a number in one place and a vector in another (a helper parameter has one type; was accept a28, flipped by the sheet change of 2026-11-25)
import { particles } from "../particles.grammar.js";

const scale = (x, k) => x * k;
function doubled(v) {
  const w = v + v;
  return w;
}

export default ($) => particles("polytypes")
  .bounds({ width: 400, height: 300 })
  .maxParticles(200)
  .field("heat", { value: 1 })
  .force("drag", (p, dt) => { p.vel = scale(p.vel, 1 - 0.1 * dt); })
  .update((p, dt) => {
    p.heat = Math.max(0, p.heat - scale(dt, 0.5));
    p.size = doubled(p.heat) + 1;
    if (p.heat === 0) { p.kill(); }
  })
  .emitter("jet", { x: 200, y: 150, maxRate: 50 })
    .rate((t, live) => scale(30, 1))
    .spawn((p, rng) => {
      p.vel = doubled(vec2(rng() * 10 - 5, -50));
    });
