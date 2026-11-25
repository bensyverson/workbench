import { particles } from "../particles.grammar.js";
const K = 4;
const LIMIT = 10;
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const speedOf = (p) => length(p.vel);
const tint = (p) => { let s = 0; for (let k = 0; k < K; k++) { s += 1; } return s; };

export default ($) => particles("pos")
  .param("rate", { value: 10, min: 0, max: 100 })
  .field("heat", { value: 0 })
  .counter("n")
  .counter("m")
  .bounds({ width: 100, height: 100 })
  .maxParticles(100)
  .tick(0.1)
  .seed(3)
  .force("up", (p, dt) => {
    let v = p.vel;
    v.x = 0;
    p.vel += vec2(0, -1) * dt;
    if (speedOf(p) > 10 && !false) { p.vel = -p.vel; }
  })
  .update((p, dt) => {
    p.heat = clamp01(p.heat + dt) % 1;
    p.size = Math.sin(Math.PI * p.heat) + tint(p);
    counters.n += p.size;
    counters.m++;
    if (p.age >= 0.5) { p.kill(); return; }
    for (let k = 0; k < K; k++) { if (k === 2) { continue; } if (k > 3) { break; } p.heat = p.heat + 0; }
  })
  .emitter("a", { x: 10, y: 10, maxRate: 5, forces: ["up"] })
    .rate((t, live) => { let r = $.rate; if (live > LIMIT) { r = 0; } return r * clamp01(t); })
    .spawn((p, rng, i) => {
      if (rng() < 0.5) { p.vel = vec2(rng() - 0.5, 0); } else { p.vel = vec2(0, 1); }
      p.life = 2 + i * 0.0 + rng();
      p.pos = p.pos + vec2(rng() * 10, 0);
      counters.n += rng();
    })
  .emitter("b", { x: 50, y: 50, maxRate: 0, forces: [] })
    .rate((t, live) => 0)
    .spawn((p, rng) => { p.life = 1; });
