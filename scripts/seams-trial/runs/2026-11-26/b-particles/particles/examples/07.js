import { particles } from "../particles.grammar.js";

// Rain on a tent: a burst emitter that an Event input drives, and a wind input a force reads.
const DRIP_FALL = 200;

export default ($) => particles("tent")
  .bounds({ width: 300, height: 200 })
  .maxParticles(400)
  .tick(1 / 60)
  .force("fall", (p, dt) => { p.vel = p.vel + vec2(0, DRIP_FALL) * dt; })
  .force("wind", (p, dt) => { p.vel = p.vel + (inp.wind - p.vel) * dt; })
  .emitter("drip", { x: 150, y: 0, maxRate: 0, on: "burst", burst: 12, forces: ["fall", "wind"] })
    .rate((t, live) => 0)
    .spawn((p, rng) => { p.vel = vec2((rng() - 0.5) * 40, 0); p.life = 0.8; p.size = 2; });
