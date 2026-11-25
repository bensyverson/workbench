import { particles } from "../particles.grammar.js";

// update kills mid-body and runs on to its end; it reads age, life and a param.
export default ($) => particles("fade")
  .param("fadeAt", { value: 0.5, min: 0, max: 1 })
  .bounds({ width: 300, height: 200 })
  .maxParticles(200)
  .field("alpha", { value: 1 })
  .update((p, dt) => {
    if (p.age > p.life * $.fadeAt) { p.kill(); }
    p.alpha = 1 - p.age / p.life;
    p.size = 1 + p.alpha;
  })
  .emitter("puff", { x: 150, y: 100, maxRate: 40 })
    .rate((t, live) => 40)
    .spawn((p, rng) => { p.life = 1 + rng(); });
