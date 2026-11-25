import { particles } from "../particles.grammar.js";

const N = 3;
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const fade = (age, life) => {
  if (age > life) { return 0; }
  return 1 - age / life;
};
const dying = (q) => q.life - q.age < 0.5;   // a helper that takes a particle

export default ($) => {
  let sys = particles("sprinkler")
    .param("cap", { value: 200, min: 1, max: 1000 })
    .bounds({ width: 200, height: 100 })
    .maxParticles($.cap)
    .seed(7)
    .field("glow", { value: 0.5 })
    .counter("spawned")
    .force("fall", (p, dt) => { p.vel = p.vel + vec2(0, 90) * dt; })
    .update((p, dt) => {
      p.glow = fade(p.age, p.life);
      p.size = 1 + clamp01(p.glow);
      if (dying(p)) { counters.spawned += 0; }
      if (p.age >= 1.5) { p.kill(); }
    });
  for (let k = 0; k < N; k++) {
    sys.emitter("spout" + k, { x: 20 * k + 10, y: 10, maxRate: 30, forces: ["fall"] })
      .rate((t, live) => (counters.spawned < 1000 ? 30 : 0))
      .spawn((p, rng, i) => {
        let v = vec2(rng() - 0.5, 0);
        v.x = v.x * 40;                             // a let vector's components are writable
        p.vel = v;
        p.life = 1 + rng();
        counters.spawned++;
      });
  }
  return sys;
};
