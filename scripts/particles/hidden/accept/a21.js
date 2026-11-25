import { particles } from "../particles.grammar.js";

// Block-body rate lambdas: a `let` local reassigned then returned; `if`/`else`
// with a return on each arm and no trailing return; an early return.
// Every path returns a number.
export default ($) => particles("blocky")
  .param("base", { value: 40, min: 0, max: 200 })
  .bounds({ width: 300, height: 200 })
  .maxParticles(300)
  .emitter("steps", { x: 50, y: 100, maxRate: 200 })
    .rate((t, live) => {
      let r = $.base;
      if (live > 100) { r = r / 2; }
      return r;
    })
    .spawn((p, rng) => { p.vel = vec2(rng() * 20, -30); })
  .emitter("branches", { x: 150, y: 100, maxRate: 20 })
    .rate((t) => {
      if (t < 1) { return 10; } else { return 20; }
    })
    .spawn((p) => { p.size = 2; })
  .emitter("early", { x: 250, y: 100, maxRate: 30 })
    .rate((t, live) => {
      const busy = live > 50;
      if (busy) { return 0; }
      return Math.max(5, 30 - t);
    })
    .spawn((p) => { p.life = 0.5; });
