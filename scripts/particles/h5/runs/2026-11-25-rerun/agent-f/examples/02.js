import { particles } from "../particles.grammar.js";
const STEPS = 4;
const DAMP = 0.9;

export default ($) => particles("jet2")
  .param("speed", { value: 120, min: 0, max: 300 })
  .bounds({ width: 300, height: 300 })
  .maxParticles(100)
  .force("pull", (p, dt) => {
    let v = p.vel;
    for (let s = 0; s < STEPS; s++) {
      v = v * DAMP;
      if (v.x > 1000) { break; }
    }
    p.vel = v + vec2(0, 50) * dt;
  })
  .force("unused", (p, dt) => { p.vel = p.vel * 1; })
  .update((p, dt) => {
    if (p.age > p.life * 0.5 && p.size > 0) { p.size = p.size - dt; }
    if (p.size <= 0) { p.kill(); }
  })
  .emitter("nozzle", { x: 150, y: 290, maxRate: 50, forces: ["pull"] })
    .rate((t, live) => {
      let r = 0;
      if (live < 20) { r = $.speed; }
      return r;
    })
    .spawn((p, rng) => {
      let s = rng();
      p.vel = vec2(s * 2, -$.speed);
      p.life = 2;
      p.size = Math.sqrt(1 + s);
    })
  .emitter("still", { x: 0, y: 0, maxRate: 0, forces: [] })
    .rate((t, live) => 0)
    .spawn((p, rng) => { p.size = 2; });
