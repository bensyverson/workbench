import { particles } from "../particles.grammar.js";

const FLAME_COUNT = 3;
const LIFE = 0.8;
// A helper that reads a particle and answers with a boolean.
const hot = (p) => p.heat > 0.5;

// A block body: build code loops over the emitters, and the lambdas never see k.
export default ($) => {
  const fire = particles("fire")
    .param("flicker", { value: 0.5, min: 0, max: 1 })
    .param("lift", { value: 80, min: 0, max: 300 })
    .bounds({ width: 200, height: 200 })
    .maxParticles(300)
    .tick(1 / 60)
    .seed(7)
    .field("heat", { value: 1 })
    .field("phase", { value: 0 })
    .counter("cooled")
    .force("rise", (p, dt) => { p.vel = p.vel + vec2(0, -$.lift) * dt; })
    .force("sway", (p, dt) => {
      p.vel = vec2(p.vel.x + Math.sin(p.phase) * $.flicker * dt, p.vel.y);
    })
    .update((p, dt) => {
      p.phase = p.phase + dt * 2 * Math.PI;
      p.heat = p.heat - dt / LIFE;
      p.size = 0.5 + p.heat;
      if (hot(p)) { p.size = p.size + 1; }
      if (p.heat <= 0) {
        p.kill();
        counters.cooled++;
        return;
      }
    });

  for (let k = 0; k < FLAME_COUNT; k++) {
    fire.emitter("base" + k, { x: 40 + k * 60, y: 190, maxRate: 120, forces: ["rise", "sway"] })
      .rate((t, live) => (live < 100 ? 120 : 0))
      .spawn((p, rng, i) => {
        p.vel = vec2((rng() - 0.5) * 20, -10 - rng() * 20);
        p.phase = rng() * 2 * Math.PI;
      });
  }
  return fire;
};
