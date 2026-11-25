import { particles } from "../particles.grammar.js";

const RINGS = 3;
const HALF = RINGS / 2 + 1;
function swirl(v, k) {
  let out = vec2(-v.y, v.x) * k;
  if (length(out) > 100) out = out / length(out) * 100;
  return out;
}
const hot = (p) => p.heat > 0.5 && !(p.age > 1);
const unused = (a) => { return; };

export default ($) => {
  const sys = particles("smoke & sparks!");
  sys.param("cap", { value: 200, min: 1, max: 1000 });
  sys.maxParticles($.cap).bounds({ width: 100.5, height: 100 }).seed(7);
  sys.field("heat", { value: 1 }).field("wind", { value: 0 }).counter("born").counter("sum");
  sys.param("wind", { value: 0, min: -1, max: 1 });
  for (let k = 0; k < 3; k++) {
    sys.force("swirl" + k, (p) => {
      let v = swirl(p.vel, 0.1);
      v.x += $.wind;
      for (let j = 0; j <= RINGS; j += 1) { if (j === 2) continue; if (j > 4) break; v = v * 0.5; }
      p.vel += v;
      p.vel = -p.vel;
    });
  }
  const e = sys.emitter("a", { x: 0, y: 100, maxRate: 0, forces: [] });
  e.rate((time, alive) => {
    let r = 0;
    r++;
    if (time > 100) return 1; else return r + counters.born % 3 + Math.max(time, alive, 3);
  });
  e.spawn((q, random, n) => {
    const a = random() * 2 * Math.PI;
    q.vel = vec2(Math.cos(a), Math.sin(a)) * (2 + n % 3);
    q.heat = hot(q) ? random() : Math.floor(Math.abs(-HALF));
    counters.born++;
    counters.sum += q.size;
    if (n > 3) return;
    q.life = Math.min(1, Math.sqrt(2), q.age + 1);
  });
  sys.update((p, dt) => { let v = p.vel; v.x = 0; p.vel = v; p.heat -= dt; p.pos = 2 * p.pos / 2; if (hot(p)) p.kill(); });
  sys.emitter("later", { x: 1, y: 1, maxRate: 1e9, forces: ["z", "swirl0"] }).rate(() => 5).spawn(() => {});
  sys.force("z", () => {});
  return sys;
};
