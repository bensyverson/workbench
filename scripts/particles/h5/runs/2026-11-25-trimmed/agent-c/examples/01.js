import { particles } from "../particles.grammar.js";
export default ($) => {
  let sys = particles("rain")
    .param("wind", { value: 0, min: -20, max: 20 })
    .bounds({ width: 400, height: 300 })
    .maxParticles(300);
  for (let k = 0; k < 3; k++) {
    sys.emitter("drop" + k, { x: 50 + k * 100, y: 0, maxRate: 30 })
      .rate((t, live) => ($.wind > 0 ? 30 : 10))
      .spawn((p, rng) => { p.vel = vec2(0, 120 + rng() * 40); p.life = 4; });
  }
  return sys;
};
