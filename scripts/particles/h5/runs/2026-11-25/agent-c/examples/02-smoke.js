import { particles } from "../particles.grammar.js";

const RISE = -30;
const swirl = (pos, t) => vec2(Math.sin(pos.y / 20 + t), 0) * 15;
const fade = (age, life) => {
  const left = 1 - age / life;
  return Math.max(0, left);
};

export default ($) => particles("smoke")
  .param("wind", { value: 10, min: -50, max: 50 })
  .emitter("wind", { x: 100, y: 190, maxRate: 30 })
    .rate(() => 12)
    .spawn((p, rng) => {
      p.vel = vec2((rng() - 0.5) * 10, RISE);
      p.life = 3;
      p.phase = rng() * Math.PI * 2;
      counters.born += p.life;
    })
  .force("wind", (p, dt) => { p.vel += (vec2($.wind, 0) + swirl(p.pos, p.age + p.phase)) * dt; })
  .update((p) => { p.size = 1 + 4 * (1 - fade(p.age, p.life)); })
  .field("phase", { value: 0 })
  .counter("born")
  .bounds({ width: 200, height: 200 })
  .maxParticles(300);
