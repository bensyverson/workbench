import { particles } from "../particles.grammar.js";

// Counters, second form: `.counter` called last (any order; cross-checks run
// once the export returns); a counter, a field and a param share one name
// (kinds have separate names); bumps inside a fixed loop and an `else`;
// a block-body rate reads the counter.
const STEPS = 3;

export default ($) => particles("shared-names")
  .param("heat", { value: 2, min: 0, max: 10 })
  .bounds({ width: 200, height: 200 })
  .maxParticles(100)
  .field("heat", { value: 1 })
  .emitter("e", { x: 100, y: 100, maxRate: 60 })
    .rate((t, live) => {
      if (counters.heat > 1000) { return 0; }
      return 30 + $.heat;
    })
    .spawn((p, rng, i) => {
      for (let k = 0; k < STEPS; k++) { counters.heat++; }
      p.heat = $.heat + rng();
    })
  .update((p, dt) => {
    p.heat -= dt;
    if (p.heat > 0) {
      p.size = 1 + p.heat;
    } else {
      counters.heat += 1;
      p.kill();
    }
  })
  .counter("heat");
