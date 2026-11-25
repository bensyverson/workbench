import { particles } from "../particles.grammar.js";

// Top-level constants and pure helpers; a helper calls other helpers and
// reads (never writes) a particle. Helpers are used in rate, force, update, spawn.
const MAX_SPEED = 120;
const BASE_RATE = 25;
const sq = (x) => x * x;
const speed = (p) => Math.sqrt(sq(p.vel.x) + sq(p.vel.y));
const clampSpeed = (p, limit) => (speed(p) > limit ? limit / speed(p) : 1);
const wave = (t) => BASE_RATE + BASE_RATE * Math.sin(t);

export default ($) => particles("helpers")
  .bounds({ width: 300, height: 300 })
  .maxParticles(400)
  .force("limit", (p, dt) => { p.vel = p.vel * clampSpeed(p, MAX_SPEED); })
  .update((p, dt) => {
    p.size = 1 + speed(p) / MAX_SPEED;
  })
  .emitter("swirl", { x: 150, y: 150, maxRate: 50 })
    .rate((t, live) => wave(t))
    .spawn((p, rng) => {
      p.vel = vec2(rng() * 400 - 200, rng() * 400 - 200);
      p.life = 1 + sq(rng());
    });
