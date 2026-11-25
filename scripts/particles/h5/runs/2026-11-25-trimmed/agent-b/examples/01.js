import { particles } from "../particles.grammar.js";

const N = 4;
const HALF = N / 2 - 1;

function swirl(p, k) {
  const away = p.pos - vec2(100, 100);
  let v = vec2(-away.y, away.x);
  if (length(v) > 0) v = v / length(v);
  return v * k;
}
const isOld = (p) => p.age > 0.5 && !(p.life < 1);
const nothing = (a) => { if (a > 0) return; };
const unused = (a, b) => a + b;

export default ($) => {
  const sys = particles("swirls & sparks: 2")
    .param("count", { value: 3, min: 1, max: 8 })
    .param("power", { value: 50, min: -100, max: 100 });
  sys.bounds({ width: 200.5, height: 200 });
  sys.maxParticles($.count * 100);
  sys.seed(7);
  sys.tick(1);
  sys.field("hue", { value: 0 });
  sys.field("constructor", { value: 0 });
  sys.counter("born");
  sys.counter("default");
  sys.param("born", { value: 0, min: 0, max: 0 });
  sys.force("born", (p) => { p.vel += swirl(p, $.power) * 0.5; });
  for (let k = 0; k < $.count; k++) {
    sys.emitter("jet" + k, { x: 200.5, y: 0, maxRate: 0, forces: k > 0 ? ["late", "born"] : [] })
      .rate((t) => {
        let r = 0;
        for (let i = 0; i <= N; i += 1) {
          if (i === HALF) continue;
          if (i > 3) break;
          r += i;
        }
        r %= 5;
        return counters.born > 10 || t > 1 ? r : Math.min(r, 1, Math.PI);
      })
      .spawn((p, random, i) => {
        let v = p.vel;
        v.x = random() * i;
        v.y += 1;
        p.vel = -v + 2 * v - v / 2;
        for (let j = 0; j < 3; j++) { if (random() > 0.5) p.hue++; }
        p.constructor = Math.floor(Math.abs(Math.sin(p.hue) + Math.cos(1) + Math.sqrt(4) + Math.max(1, 2)));
        counters.born++;
        counters.default += p.size;
      });
  }
  sys.force("late", (p, dt) => { if (isOld(p)) return; p.vel = p.vel * (1 - dt); });
  sys.update((particle, dt) => {
    nothing(dt);
    particle.pos = particle.pos + vec2(0, dt);
    if (isOld(particle) === true) { particle.kill(); return; }
    particle.size += particle.hue--;
    counters.born += particle.size;
  });
  return sys;
};
