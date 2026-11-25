import { particles } from "../particles.grammar.js";

const RINGS = 6;

// Build code: a block body that loops over the emitters and returns the one Program.
export default ($) => {
  const sys = particles("bubbles")
    .param("buoyancy", { value: 50, min: 0, max: 200 })
    .bounds({ width: 150, height: 150 })
    .maxParticles(80)
    .tick(1 / 20)
    .field("wobble", { value: 0 })
    .force("buoy", (p, dt) => {
      if (p.pos.y > 20) {
        p.vel = p.vel + vec2(0, -$.buoyancy * dt);
      } else {
        p.vel = vec2(p.vel.x, 0);
      }
    })
    .update((p, dt) => {
      p.wobble = p.wobble + dt;
      p.size = 1 + 0.5 * Math.sin(p.wobble * 4);
    });

  for (let k = 0; k < RINGS; k++) {
    sys.emitter("ring" + k, { x: 75, y: 140, maxRate: 4, forces: ["buoy"] })
      .rate((t, live) => (t < 3 ? 4 : 0))
      .spawn((p, rng) => {
        const a = rng() * Math.PI * 2;
        let v = vec2(Math.cos(a), Math.sin(a)) * 10;
        p.vel = v;
        p.pos = vec2(75 + Math.cos(a) * 10, 140);
      });
  }
  return sys;
};
