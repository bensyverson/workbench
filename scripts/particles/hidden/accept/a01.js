import { particles } from "../particles.grammar.js";

// Top-level helpers and plain-data constants: lambdas may use them.
const GRAVITY = 300;
const spread = (r, width) => (r - 0.5) * width;

export default ($) => particles("fountain")
  .param("rate", { value: 60, min: 0, max: 400 })
  .param("wind", { value: 0, min: -100, max: 100 })
  .bounds({ width: 400, height: 300 })
  .maxParticles(500)
  .tick(1 / 30)
  .field("heat", { value: 1 })
  .force("gravity", (p, dt) => { p.vel = p.vel + vec2($.wind, GRAVITY) * dt; })
  .force("drag", (p, dt) => { p.vel = p.vel * (1 - 0.5 * dt); })
  .update((p, dt) => {
    p.heat = Math.max(0, p.heat - dt);
    p.size = 1 + p.heat * 2;
    if (p.heat === 0) { p.kill(); }
  })
  .emitter("jet", { x: 200, y: 290, maxRate: 400, forces: ["gravity", "drag"] })
    .rate((t, live) => $.rate)
    .spawn((p, rng, i) => {
      p.vel = vec2(spread(rng(), 80), -250 - rng() * 50);
      p.life = 1.5 + rng();
    })
  .emitter("mist", { x: 200, y: 150, maxRate: 20 })
    .rate((t, live) => (live < 50 ? 20 : 0))
    .spawn((p, rng) => { p.pos = p.pos + vec2(spread(rng(), 300), 0); p.size = 3; });
