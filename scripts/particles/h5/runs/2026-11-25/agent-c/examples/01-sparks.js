import { particles } from "../particles.grammar.js";

const G = 200;
const BURSTS = 3;

// A helper over a particle, and one with a loop.
const speed = (p) => length(p.vel);
function jitter(r) {
  let sum = 0;
  for (let k = 0; k < BURSTS; k++) { sum += r - 0.5; }
  return sum;
}

export default ($) => {
  const sys = particles("sparks")
    .param("cap", { value: 100, min: 10, max: 500 })
    .bounds({ width: 320, height: 240 })
    .maxParticles($.cap * 2)
    .seed(7);
  sys.field("hot", { value: 0 });
  sys.counter("bounces");
  for (let k = 0; k < 3; k++) {
    sys.emitter("flame" + k, { x: 80 + k * 80, y: 230, maxRate: 40, forces: ["gravity"] })
      .rate((t, live) => {
        if (live > 60) return 0;
        return counters.bounces > 100 ? 5 : 20;
      })
      .spawn((p, random, i) => {
        p.vel = vec2(jitter(random()) * 40, -150 - random() * 60);
        p.life = 1 + random();
        p.hot = i % 2;
      });
  }
  sys.force("gravity", (p, dt) => { p.vel += vec2(0, G) * dt; });
  sys.update((p) => {
    let v = p.vel;
    if (p.pos.y > 235 && v.y > 0) {
      v.y = -v.y / 2;
      p.vel = v;
      counters.bounces++;
    }
    if (speed(p) < 5) { p.kill(); return; }
    p.size = p.hot === 1 ? 3 : Math.max(1, 2 - p.age);
  });
  return sys;
};
