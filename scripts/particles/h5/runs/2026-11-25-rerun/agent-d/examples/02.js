import { particles } from "../particles.grammar.js";

export default ($) => particles("")
  .emitter("rate", { x: 0, y: 0, maxRate: 0 })
    .spawn(() => {})
    .rate(() => 1)
  .force("rate", () => {})
  .field("rate", { value: -2 })
  .counter("rate")
  .param("rate", { value: 1, min: 1, max: 1 })
  .maxParticles(1)
  .tick(1)
  .emitter("late", { x: 4096, y: 1, maxRate: 1e9, forces: ["later"] })
    .rate((t) => (t > $.rate ? counters.rate : 0))
    .spawn((p) => { p.rate = $.rate; counters.rate += p.size; })
  .force("later", (p, dt) => { p.vel = p.vel * dt; })
  .bounds({ width: 4096, height: 1 });
