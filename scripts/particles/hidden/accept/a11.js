import { particles } from "../particles.grammar.js";

// Block-body exported function with an `if` that adds a force at build time,
// reading a param after its .param call.
export default ($) => {
  let sys = particles("optional-wind")
    .param("windy", { value: 1, min: 0, max: 1 })
    .bounds({ width: 300, height: 300 })
    .maxParticles(300)
    .force("gravity", (p, dt) => { p.vel = p.vel + vec2(0, 98) * dt; });
  if ($.windy > 0.5) {
    sys = sys.force("wind", (p, dt) => { p.vel = p.vel + vec2(30, 0) * dt; });
  }
  return sys
    .emitter("drop", { x: 150, y: 10, maxRate: 30 })
    .rate(() => 30)
    .spawn((p, rng) => { p.vel = vec2(0, rng() * 20); });
};
