import { particles } from "../particles.grammar.js";

// Build code is plain JavaScript: a loop adds emitters, and the block returns the chain.
const LANES = 4;
const WIDTH = 400;
const lane = (k) => (k + 0.5) * (WIDTH / LANES);
const jitter = (r) => (r - 0.5) * 20;

export default ($) => {
  let sys = particles("lanes")
    .param("rate", { value: 30, min: 0, max: 200 })
    .param("wind", { value: 5, min: -50, max: 50 })
    .bounds({ width: WIDTH, height: 300 })
    .maxParticles(800)
    .tick(1 / 60)
    .seed(7)
    .field("heat", { value: 1 })
    .counter("landed")
    .force("gravity", (p, dt) => { p.vel = p.vel + vec2(0, 200) * dt; })
    .force("wind", (p, dt) => { p.vel = p.vel + vec2($.wind, 0) * dt; })
    .update((p, dt) => {
      p.heat = p.heat - dt;
      if (p.pos.y > 290) {
        p.kill();
        counters.landed++;
      }
      if (p.heat <= 0) { p.kill(); }
    });
  for (let k = 0; k < LANES; k++) {
    sys = sys.emitter("lane" + k, { x: lane(k), y: 10, maxRate: 40, forces: k % 2 === 0 ? ["gravity", "wind"] : ["gravity"] })
      .rate((t, live) => (live < 100 ? $.rate : 0))
      .spawn((p, rng) => {
        p.vel = vec2(jitter(rng()), 0);
        p.heat = 0.5 + rng();
        p.size = Math.max(1, length(p.vel));
      });
  }
  sys = sys.emitter("still", { x: 200, y: 150, maxRate: 0, forces: [] })
    .rate((t, live) => 0)
    .spawn((p, rng) => { p.size = 2; });
  return sys;
};
