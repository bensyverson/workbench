import { particles } from "../particles.grammar.js";

// Range ends and call order: tick(1), maxParticles(10000), bounds width 4096
// with a fractional height, an emitter on the far corner, a huge maxRate
// (no upper limit), param values at their min and max; emitters first, then
// .param, .bounds, .force and .update (any order); an emitter named like a
// force and one named `t`; a lambda reading params declared after it.
export default ($) => particles("ends")
  .emitter("gravity", { x: 4096, y: 1.5, maxRate: 0 })
    .rate(() => 0)
    .spawn((p) => { p.size = 1; })
  .emitter("t", { x: 0, y: 0, maxRate: 1000000 })
    .rate((t) => $.lo + $.hi)
    .spawn((p) => { p.life = 0.5; })
  .param("lo", { value: 0, min: 0, max: 5 })
  .param("hi", { value: 5, min: 0, max: 5 })
  .bounds({ width: 4096, height: 1.5 })
  .maxParticles(10000)
  .tick(1)
  .force("gravity", (p, dt) => { p.vel = p.vel + vec2(0, 1) * dt; })
  .update((p) => { p.size = 1; });
