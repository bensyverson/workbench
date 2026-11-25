import { particles } from "../particles.grammar.js";

const SPARKS = 6;
const LIFT = -80;
const fade = (p) => Math.max(0, 1 - p.age / p.life);
function burst(angle, speed) {
  return vec2(Math.cos(angle), Math.sin(angle)) * speed;
}

export default ($) => {
  const sys = particles("fireworks");
  sys.param("count", { value: 3, min: 1, max: 5 });
  sys.bounds({ width: 640, height: 480 }).maxParticles(2000).seed(7);
  sys.field("glow", { value: 1 }).counter("born").counter("died");
  for (let k = 0; k < $.count; k++) {
    sys.emitter("shell" + k, { x: 100 + 100 * k, y: 240, maxRate: 120, forces: ["air"] })
      .rate((t, live) => (t % 2 < 0.5 && live < 400 ? 120 : 0))
      .spawn((p, random, i) => {
        const angle = (i % SPARKS) * (2 * Math.PI / SPARKS) + random();
        p.vel = burst(angle, 60 + random() * 40);
        p.life = 1 + random();
        counters.born++;
      });
  }
  sys.force("air", (p, dt) => {
    let v = p.vel;
    v.y -= LIFT * dt;
    p.vel = v * (1 - 0.4 * dt);
  });
  sys.update((p, dt) => {
    p.glow = fade(p);
    p.size = 1 + 2 * p.glow;
    if (length(p.vel) < 1) {
      p.kill();
      counters.died += 1;
    }
  });
  return sys;
};
