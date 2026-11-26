import { particles } from "../particles.grammar.js";

// Pickups: an emitter fired by the burst input, and a force and a rate that read the value inputs.
// Built on its own, nothing is wired: no bursts arrive, inp.level is 1 and inp.target is (0, 0).
const PULL = 4;

export default ($) => particles("pickups")
  .param("sparks", { value: 24, min: 1, max: 100 })
  .bounds({ width: 320, height: 256 })
  .maxParticles(2000)
  .tick(1 / 60)
  .force("seek", (p, dt) => { p.vel = p.vel + (inp.target - p.pos) * PULL * dt; })
  .force("drag", (p, dt) => { p.vel = p.vel * (1 - 2 * dt); })
  .update((p, dt) => { p.size = 2 * Math.max(0, 1 - p.age / p.life); })
  // fired once per burst record, at the record's position; rate is the particles per record
  .emitter("pop", { x: 160, y: 128, maxRate: 100, trigger: "burst" })
    .rate((t, live) => $.sparks * inp.level)
    .spawn((p, rng) => {
      const a = rng() * 2 * Math.PI;
      p.vel = vec2(Math.cos(a), Math.sin(a)) * (60 + 60 * rng());
      p.life = 0.6 + 0.4 * rng();
    })
  // a steady trickle that drifts toward the target
  .emitter("glow", { x: 160, y: 250, maxRate: 30, forces: ["seek", "drag"] })
    .rate((t, live) => 10 * inp.level)
    .spawn((p, rng) => {
      p.vel = vec2((rng() - 0.5) * 20, -30);
      p.life = 3;
    });
