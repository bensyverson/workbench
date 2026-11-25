import { particles } from "../particles.grammar.js";

// Block-body exported function: a build-time loop adds emitters, its count
// read from a param after that param's .param call; then returns the chain.
export default ($) => {
  let sys = particles("candles")
    .param("count", { value: 4, min: 1, max: 8 })
    .param("flicker", { value: 10, min: 0, max: 40 })
    .bounds({ width: 400, height: 200 })
    .maxParticles(800)
    .force("rise", (p, dt) => { p.vel = p.vel + vec2(0, -60) * dt; });
  for (let k = 0; k < $.count; k++) {
    sys = sys
      .emitter("flame" + k, { x: 40 + k * 40, y: 180, maxRate: 50 })
      .rate((t, live) => 20 + $.flicker * Math.sin(t * 7))
      .spawn((p, rng) => { p.vel = vec2(rng() * 10 - 5, -20); p.life = 0.8; });
  }
  return sys;
};
