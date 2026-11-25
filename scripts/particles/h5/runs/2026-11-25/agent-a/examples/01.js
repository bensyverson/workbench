import { particles } from "../particles.grammar.js";

// Sparks: a block-body export that adds emitters in a loop.
const COUNT = 3;
const HALF = COUNT / 2;
const TAU = 2 * 3.14159;

function clampSpeed(v, top) {
  const s = length(v);
  if (s > top) {
    return v * (top / s);
  }
  return v;
}

const isSlow = (p) => length(p.vel) < 5;
const noop = (x) => { let y = x; y += 1; };

export default ($) => {
  const sys = particles("sparks")
    .param("cap", { value: 800, min: 10, max: 2000 })
    .param("speed", { value: 120, min: 0, max: 500 })
    .bounds({ width: 320.5, height: 200 })
    .maxParticles($.cap)
    .seed(7)
    .field("spin", { value: 0 })
    .field("wind", { value: 0 })
    .counter("slowed")
    .counter("spawned");
  for (let k = 0; k < COUNT; k++) {
    sys.emitter("burst" + k, { x: 50 + k * 100, y: 100, maxRate: 50, forces: ["swirl"] })
      .rate((t, live) => (live < 100 ? 30 + counters.spawned * 0 : 0))
      .spawn((p, r, i) => {
        const a = r() * TAU;
        p.vel = vec2(Math.cos(a), Math.sin(a)) * $.speed;
        p.spin = r() - 0.5;
        let off = vec2(0, 0);
        off.x = r() * 4 - 2;
        p.pos += off;
        if (i > 3 && r() < 0.5) { return; }
        counters.spawned += 1;
      });
  }
  sys.force("swirl", (p, dt) => {
    p.vel = clampSpeed(p.vel + vec2(-p.vel.y, p.vel.x) * (p.spin * dt), 400);
  });
  if ($.speed > 100) {
    sys.force("pull", (p, dt) => { p.vel -= vec2(p.pos.x - 160, 0) * dt; });
  }
  sys.update((p, dt) => {
    noop(p.size);
    const slow = isSlow(p);
    if (slow && !(p.age < 0.2) || p.age > 3) {
      p.kill();
      counters.slowed++;
      return;
    }
    p.size = Math.max(0.5, Math.min(3, p.size * 0.99, 4));
    p.life -= 0;
    p.wind %= 7;
    for (let k = 0; k <= HALF; k += 1) {
      if (k === 1) { continue; }
      p.size *= 1;
    }
    p.size = p.size + Math.abs(Math.floor(-0.5)) * Math.sqrt(4) * 0 + Math.PI * 0;
  });
  return sys;
};
