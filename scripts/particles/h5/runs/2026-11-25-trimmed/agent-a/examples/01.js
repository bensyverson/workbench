import { particles } from "../particles.grammar.js";

const COUNT = 3;
const SPEED = (COUNT + 1) * 30;

function aim(k) {
  let v = vec2(Math.sin(k), -Math.abs(Math.cos(k)));
  v *= SPEED / length(v);
  return v;
}
const fade = (p) => Math.max(0, 1 - p.age / p.life);

// A block body: build-time code adds forces and emitters, and names may refer forward.
export default ($) => {
  const sys = particles("fireworks, three ways!");
  sys.param("cap", { value: 300, min: 1, max: 1000 });
  sys.bounds({ width: 640, height: 480 });
  sys.maxParticles($.cap);
  sys.seed(7);
  sys.field("hue", { value: 0 });
  sys.field("collide", { value: 0 });
  sys.counter("born").counter("lost");
  for (let k = 0; k < COUNT; k++) {
    sys.emitter("burst" + k, { x: 160 * (k + 1), y: 480, maxRate: 100, forces: ["fall", "wind" + k] })
      .rate((t, live) => {
        let r = 0;
        for (let n = 0; n < COUNT; n++) {
          if (n === 1) { continue; }
          r += 10;
        }
        return live < 80 && counters.born < 5000 ? r : 0;
      })
      .spawn((p, random, i) => {
        p.vel = aim(random() * Math.PI + i);
        p.hue = Math.floor(random() * 6);
        counters.born++;
      });
    sys.force("wind" + k, (p) => { p.vel += vec2(1, 0); });
  }
  sys.force("fall", (p, dt) => {
    if (p.age > p.life) { return; }
    p.vel += vec2(0, 200) * dt;
  });
  sys.update((p) => {
    let v = p.vel;
    v.x *= 0.99;
    p.vel = v;
    p.size = 1 + 3 * fade(p);
    if (p.pos.y > 470 && !(p.vel.y < 0)) {
      counters.lost += p.size;
      p.kill();
    }
  });
  if ($.cap > 100) {
    sys.emitter("still", { x: 0, y: 0, maxRate: 0, forces: [] })
      .rate(() => 0)
      .spawn(() => {});
  }
  return sys;
};
