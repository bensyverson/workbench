import { particles } from "../particles.grammar.js";
export default ($) => particles("sparks")
  .param("wind", { value: 0, min: -10, max: 10 })
  .bounds({ width: 50, height: 50 })
  .maxParticles(100)
  .counter("born")
  .force("wind", (p, dt) => { p.vel = p.vel + vec2($.wind, 0) * dt; })
  .emitter("fire", { x: 25, y: 25, maxRate: 50, forces: ["wind"] })
    .rate((t, live) => (counters.born < 500 ? 50 : 0))
    .spawn((p, rng, i) => {
      if (i > 3) { return; }
      counters.born += 1;
      p.vel = vec2(rng() * 4 - 2, -rng() * 4);
      p.life = 2;
    });
