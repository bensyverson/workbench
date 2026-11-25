import { particles } from "../particles.grammar.js";

const STEPS = 4;
const DRIFT = 15;

// Helpers: a boolean on a particle, a number from numbers, and a loop with break.
const onScreen = (p) => p.pos.y < 300 && length(p.vel) < 500 && p.size > 0;
const wobble = (x, k) => Math.sin(x * k) * DRIFT;
const clampSteps = (n) => {
  let s = 0;
  for (let k = 0; k < STEPS; k++) {
    if (k >= n) break;
    s += 1;
  }
  return s;
};

export default ($) => particles("snow")
  .param("gust", { value: 0, min: -50, max: 50 })
  .bounds({ width: 320, height: 240 })
  .maxParticles(200)
  .counter("landed")
  .force("fall", (p, dt) => { p.vel = vec2(p.vel.x, p.vel.y + 40 * dt); })
  .force("blow", (p, dt) => {
    let v = p.vel;                       // a let vector: its components may be set
    v.x = $.gust + wobble(p.age, 3);
    p.vel = v;
  })
  .update((p, dt) => {
    p.size = Math.abs(Math.cos(p.age)) * 0.5 + 0.5;
    if (!onScreen(p)) {
      p.kill();
      counters.landed += 1;
    }
  })
  .emitter("snow", { x: 160, y: 0, maxRate: 60, forces: ["fall", "blow"] })
    .rate((t, live) => {
      let r = 60;
      for (let k = 0; k < STEPS; k++) {
        if (counters.landed > 50 * k) { r = r - 10; }
      }
      return r > 0 ? r : 0;
    })
    .spawn((p, rng, i) => {
      p.pos = vec2(rng() * 320, 0);
      p.size = 0.5 + clampSteps(i + 1) * 0.25;
      p.life = 20;
    })
  .emitter("sparks", { x: Math.floor(100), y: 10, maxRate: 4, forces: [] })
    .rate((t, live) => Math.floor(t) < 2 ? 4 : 0)
    .spawn((p) => { p.pos = vec2(100, 10); p.life = 1; });
