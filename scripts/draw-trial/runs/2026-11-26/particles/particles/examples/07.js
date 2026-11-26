import { particles } from "../particles.grammar.js";

// Sparks: each record on the burst input throws 30 sparks out from its position, as fast as inp.speed; a slow
// ember drifts up from the middle all the time.
const GRAVITY = 200;

export default ($) => particles("sparks")
  .bounds({ width: 320, height: 240 })
  .maxParticles(400)
  .force("fall", (p, dt) => { p.vel = p.vel + vec2(0, GRAVITY) * dt; })
  .emitter("pop", { x: 160, y: 120, maxRate: 0, forces: ["fall"], trigger: "burst", perEvent: 30 })
    .rate((t, live) => 0)
    .spawn((p, rng, i) => {
      const a = rng() * 2 * Math.PI;
      p.pos = ev.at;
      p.vel = vec2(Math.cos(a), Math.sin(a)) * inp.speed * (0.5 + rng());
      p.life = 0.6;
    })
  .emitter("ember", { x: 160, y: 120, maxRate: 5 })
    .rate((t, live) => 2)
    .spawn((p, rng) => { p.vel = vec2(0, -20); p.life = 3; });
