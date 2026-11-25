import { particles } from "../particles.grammar.js";
// A block body that builds the chain in plain JavaScript and returns it.
export default ($) => {
  let sys = particles("sprinkler")
    .param("cap", { value: 50, min: 1, max: 200 })
    .bounds({ width: 400, height: 300 })
    .maxParticles($.cap)
    .force("gravity", (p, dt) => { p.vel += vec2(0, 200) * dt; });
  for (let k = 0; k < 3; k++) {
    sys.emitter("nozzle" + k, { x: 50 + k * 100, y: 0, maxRate: 10, forces: ["gravity"] })
      .rate((t, live) => $.cap > 0 ? 10 : 0)
      .spawn((p, rng) => { p.life = 2 + rng(); });
  }
  return sys;
};
