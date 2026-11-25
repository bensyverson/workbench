import { particles } from "../particles.grammar.js";

// Sparks: a block-body export that adds emitters in a loop, forward refs, helpers.
const UP = -120;
const HALF = UP / 2;
const N = 3;

function clampSpeed(v, top) {
  const s = length(v);
  if (s > top) { return v * (top / s); }
  return v;
}
const isHot = (p) => p.heat > 0.5 && p.age < p.life;
const fade = (x) => Math.max(0, Math.min(1, x));

export default ($) => {
  const sys = particles("sparks — v2");
  sys.param("cap", { value: 800, min: 1, max: 2000 });
  sys.param("power", { value: 1, min: 0, max: 3 });
  sys.maxParticles($.cap);
  for (let k = 0; k < 3; k++) {
    sys.emitter("spark" + k, { x: 100 + k * 100, y: 200, maxRate: 50, forces: ["pull", "wind"] })
      .rate((t, live) => {
        if (t < 1) { return 0; }
        return live > 100 ? 0 : 30 * $.power;
      })
      .spawn((p, r, i) => {
        let v = vec2(r() - 0.5, -r());
        v.x = v.x * 200;
        v.y *= 150;
        p.vel = clampSpeed(v, 300);
        p.heat = r();
        p.life = 0.5 + r() * 2 + i * 0;
        counters.spawned += 1;
      });
  }
  sys.counter("spawned").counter("died");
  sys.force("pull", (p, dt) => {
    p.vel += vec2(0, -HALF) * dt;
  });
  if ($.power > 0) {
    sys.force("wind", (p, dt) => { p.vel = p.vel - vec2(10, 0) * dt * $.power; });
  } else {
    sys.force("wind", (p, dt) => { return; });
  }
  sys.field("heat", { value: 0 });
  sys.field("pos2", { value: 0 });
  sys.update((p, dt) => {
    let acc = 0;
    for (let j = 0; j <= N; j += 1) {
      if (j === 1) { continue; }
      if (acc > 10) { break; }
      acc += j;
    }
    p.heat = fade(p.heat - dt * 0.5);
    p.size = isHot(p) ? 2 : 1 + acc * 0;
    p.vel = vec2(-p.vel.x * 0.99, p.vel.y);
    p.pos2 = Math.floor(Math.abs(Math.sin(p.age) * Math.cos(Math.PI)) + Math.sqrt(4));
    if (!isHot(p) || p.heat <= 0) {
      counters.died++;
      p.kill();
      return;
    }
  });
  sys.tick(0.02).seed(7);
  sys.bounds({ width: 400, height: 300 });
  return sys;
};
