import { particles } from "../particles.grammar.js";

const PUFFS = 4;
const hot = (p) => p.temp > 0.5;
const jitter = (r) => {
  let sum = 0;
  for (let k = 0; k < PUFFS; k++) {
    sum += r;
  }
  return sum / PUFFS - 0.5;
};

export default ($) => particles("smoke")
  .emitter("chimney", { x: 150, y: 200, maxRate: 60 })
    .rate((t) => {
      if (t < 1) return 0;
      return $.rate * (1 + Math.sin(t));
    })
    .spawn((p, rng) => {
      p.temp = rng();
      p.drift = jitter(rng()) * 20;
      p.vel = vec2(p.drift, -30);
      p.life = 4;
    })
  .param("rate", { value: 20, min: 0, max: 30 })
  .field("temp", { value: 0 })
  .field("drift", { value: 0 })
  .bounds({ width: 300, height: 200 })
  .maxParticles(300)
  .force("rise", (p, dt) => {
    if (!hot(p)) return;
    p.vel += vec2(0, -10) * dt;
  })
  .update((p, dt) => {
    p.temp = Math.max(0, p.temp - 0.2 * dt);
    p.size += hot(p) ? dt : dt / 2;
  });
