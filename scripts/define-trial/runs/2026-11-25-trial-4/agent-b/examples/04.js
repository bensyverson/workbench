import { particles } from "../particles.grammar.js";

const jitter = (r, amount) => (r - 0.5) * amount;

export default ($) => {
  let sys = particles("jets")
    .param("count", { value: 3, min: 1, max: 5 })
    .bounds({ width: 500, height: 200 })
    .maxParticles(3000)
    .force("gravity", (p, dt) => { p.vel = p.vel + vec2(0, 200) * dt; });
  for (let k = 0; k < $.count; k++) {
    sys.emitter("jet" + k, { x: 100 + k * 100, y: 190, maxRate: 100 })
      .rate((t, live) => 40)
      .spawn((p, rng) => {
        p.vel = vec2(jitter(rng(), 60), -150);
        p.life = 1.2;
      });
  }
  return sys;
};
