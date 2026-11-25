import { particles } from "../particles.grammar.js";

// `for` loops bounded by top-level constants (one built from an earlier
// constant), a constant start, `<=` with `k += 1`, `break` and `continue`;
// loops in update, a block-body rate, spawn and a helper.
const STEPS = 4;
const START = 1;
const HALF = STEPS / 2;
const total = (n) => {
  let s = 0;
  for (let k = 0; k < STEPS; k++) { s += n; }
  return s;
};

export default ($) => particles("const-loops")
  .bounds({ width: 400, height: 300 })
  .maxParticles(500)
  .update((p, dt) => {
    let s = 0;
    for (let k = START; k <= STEPS; k += 1) {
      if (k === 2) { continue; }
      s += k * dt;
    }
    p.size = 1 + s;
  })
  .emitter("fan", { x: 200, y: 150, maxRate: 90 })
    .rate((t, live) => {
      let r = 0;
      for (let k = 0; k < HALF; k++) { r += 10; }
      return r;
    })
    .spawn((p, rng) => {
      let v = vec2(0, 0);
      for (let k = 0; k < STEPS; k++) {
        v = v + vec2(rng() - 0.5, rng() - 0.5);
        if (length(v) > 2) { break; }
      }
      p.vel = v * 50;
      p.life = total(0.5);
    });
