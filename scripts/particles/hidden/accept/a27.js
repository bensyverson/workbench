import { particles } from "../particles.grammar.js";

// `rng` forms now stated outright: spawn's second parameter under another
// name (`r`), called inside an `if`, inside a fixed loop and as a helper's
// argument; its result kept in a `const`. A `let` local copy of a vector
// field, with a component written, leaves the field alone.
const spread = (x, width) => (x - 0.5) * width;

export default ($) => particles("rng-forms")
  .bounds({ width: 300, height: 300 })
  .maxParticles(200)
  .field("seedling", { value: 0 })
  .update((p, dt) => {
    let v = p.vel;
    v.x = 0;
    p.size = 1 + length(v) / 50 + p.seedling;
  })
  .emitter("e", { x: 150, y: 150, maxRate: 40 })
    .rate(() => 40)
    .spawn((p, r, i) => {
      const first = r();
      if (i < 3) { p.size = 1 + r(); }
      for (let k = 0; k < 2; k++) { p.life += r(); }
      p.vel = vec2(spread(r(), 40), -20 * first);
      p.seedling = r();
    });
