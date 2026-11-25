import { particles } from "../particles.grammar.js";

const COUNT = 3;
const SPREAD = 40 * 2;
const half = (x) => x / 2;
function swirl(p, k) {
  let v = p.vel;
  v.x += Math.sin(p.age * k) * 10;
  v.y -= Math.cos(p.age * k);
  return v;
}
const hot = (p) => p.heat > 0.5 && !(p.age > 1);
const nothing = (a) => { let b = a; b += 1; };

export default ($) => {
  let sys = particles("sparks and smoke")
    .param("cap", { value: 200, min: 10, max: 500 })
    .param("wind", { value: 5, min: -50, max: 50 })
    .bounds({ width: 200.5, height: 100 })
    .field("heat", { value: 1 })
    .field("rng", { value: 0 })
    .counter("born")
    .counter("heatSum")
    .counter("wind");
  sys.maxParticles($.cap);
  sys.seed(7);
  for (let k = 0; k < COUNT; k++) {
    sys = sys
      .emitter("flame" + k, { x: 20 + k * 40, y: 100, maxRate: 30, forces: k === 0 ? [] : ["wind", "lift"] })
      .rate((t, live) => {
        if (live > $.cap / 2) return 0;
        let r = 0;
        for (let j = 0; j <= COUNT; j += 1) {
          if (j === 2) continue;
          r += half(j);
        }
        return counters.born < 100 ? r * 4 : Math.max(1, r, half(t));
      })
      .spawn((q, random, n) => {
        const a = random() * Math.PI;
        q.vel = vec2(Math.cos(a), -Math.sin(a)) * SPREAD;
        q.rng = random();
        q.life = 1 + Math.floor(random() * 3);
        for (let j = 0; j < 2; j++) q.size += random();
        counters.born++;
        if (n > 5) return;
        counters.heatSum += q.size;
      });
  }
  if ($.wind > 0) sys.force("wind", (p, dt) => { p.vel += vec2($.wind, 0) * dt; });
  sys.force("lift", (p) => { p.vel = swirl(p, 2); });
  sys.update((p, dt) => {
    let d = -p.vel / 2;
    d.x = Math.abs(d.x);
    p.heat = hot(p) ? p.heat - dt : Math.min(p.heat, length(d), Math.sqrt(4));
    p.size %= 4;
    p.pos = p.pos + vec2(0, 0) * dt;
    nothing(1);
    if (p.heat < 0) {
      p.kill();
      counters.born += p.size;
      return;
    }
  });
  return sys;
};
