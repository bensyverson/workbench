import { particles } from "../particles.grammar.js";

// Sparks: a block-bodied export that adds emitters in a loop.
const FLAMES = 3;
const BASE = 40;
const WIDE = BASE * 2 + 1;
const jitter = (r, w) => (r - 0.5) * w;
function clamp01(x) {
  return Math.min(1, Math.max(0, x));
}
const isSlow = (p) => length(p.vel) < 10;
const flip = (v) => -v;

export default ($) => {
  const sys = particles("sparks")
    .param("cap", { value: 300, min: 1, max: 2000 })
    .param("heat", { value: 0.5, min: 0, max: 1 })
    .bounds({ width: 640, height: 480 })
    .maxParticles($.cap)
    .seed(7)
    .field("glow", { value: 0 })
    .field("phase", { value: 0 })
    .counter("spawned")
    .counter("faded");
  for (let k = 0; k < FLAMES; k++) {
    sys.emitter("flame" + k, { x: 100 + k * 200, y: 470, maxRate: 120, forces: ["lift", "swirl"] })
      .rate((t, live) => {
        if (live > 100) {
          return 0;
        } else if (counters.faded > 5000) {
          return 10;
        }
        return 60 + 60 * $.heat;
      })
      .spawn((p, rng, i) => {
        let v = vec2(jitter(rng(), WIDE), -100 - rng() * 80);
        v.x = v.x * 0.5;
        p.vel = v;
        p.phase = rng() * Math.PI * 2;
        p.glow = clamp01(rng() + i * 0.01);
        p.life = 0.5 + rng();
        counters.spawned += 1;
      });
  }
  sys.force("lift", (p, dt) => {
    p.vel = p.vel + vec2(0, -50) * dt;
  });
  sys.force("swirl", (p, dt) => {
    p.vel += vec2(Math.sin(p.phase + p.age * 3), 0) * 20 * dt;
  });
  sys.force("unused", (p, dt) => {
    if (isSlow(p)) {
      return;
    }
    p.vel = flip(p.vel) * 0.01 + p.vel * 0.99;
  });
  sys.update((p, dt) => {
    let fading = p.age > p.life * 0.5;
    let g = p.glow;
    for (let n = 0; n <= 3; n += 1) {
      if (n === 2) { break; }
      if (!fading) { continue; }
      g -= dt * 0.5;
    }
    p.glow = clamp01(g);
    p.size = fading ? 1 : 2 + p.glow;
    p.pos = vec2(Math.floor(p.pos.x * 10) / 10, p.pos.y);
    if (p.glow <= 0 || Math.abs(p.vel.x) > 500) {
      p.kill();
      counters.faded++;
    }
  });
  return sys;
};
