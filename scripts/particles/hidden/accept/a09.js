import { particles } from "../particles.grammar.js";

// let locals, reassigned; for loops with a fixed count in update and spawn.
export default ($) => particles("loops")
  .bounds({ width: 400, height: 300 })
  .maxParticles(500)
  .update((p, dt) => {
    let s = 0;
    for (let k = 0; k < 4; k++) {
      s = s + p.age * k;
    }
    p.size = 1 + s / 10;
    if (s > 50) { p.kill(); }
  })
  .emitter("fan", { x: 200, y: 150, maxRate: 90 })
    .rate((t, live) => 90)
    .spawn((p, rng) => {
      let v = vec2(0, 0);
      for (let k = 0; k < 3; k++) {
        v = v + vec2(rng() - 0.5, rng() - 0.5);
      }
      p.vel = v * 100;
    });
