import { particles } from "../particles.grammar.js";

// Pickups: an Event input makes a burst at each record's position, and a value input (wind) pushes every particle.
export default ($) => particles("pickups")
  .bounds({ width: 400, height: 300 })
  .maxParticles(400)
  .tick(1 / 30)
  .force("breeze", (p, dt) => { p.vel = p.vel + inputs.wind * dt; })
  .force("drag", (p, dt) => { p.vel = p.vel * (1 - 0.8 * dt); })
  .emitter("sparkle", { x: 200, y: 150, maxRate: 0, from: "pickup", burst: 12, forces: ["breeze", "drag"] })
    .rate((t, live) => 0)
    .spawn((p, rng, i) => {
      p.pos = pickup.at;
      p.vel = vec2(rng() - 0.5, rng() - 0.5) * 200;
      p.life = 0.6 + rng() * 0.4;
      p.size = 2;
    });
