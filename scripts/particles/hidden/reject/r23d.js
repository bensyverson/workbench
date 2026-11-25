// REJECT 23: spawn decrements a counter: `counters.burnedOut -= 1` (only `+=` and `++` bump)
import { particles } from "../particles.grammar.js";

const GRAVITY = 200;
const half = (x) => x * 0.5;

export default ($) => particles("base")
  .param("wind", { value: 0, min: -50, max: 50 })
  .bounds({ width: 400, height: 300 })
  .maxParticles(200)
  .tick(1 / 60)
  .seed(1)
  .field("heat", { value: 1 })
  .counter("burnedOut")
  .force("gravity", (p, dt) => { p.vel = p.vel + vec2($.wind, GRAVITY) * dt; })
  .force("drag", (p, dt) => { p.vel = p.vel * (1 - 0.1 * dt); })
  .update((p, dt) => {
    p.heat = Math.max(0, p.heat - half(dt));
    if (p.heat === 0) { p.kill(); counters.burnedOut++; }
  })
  .emitter("jet", { x: 200, y: 150, maxRate: 50, forces: ["gravity", "drag"] })
    .rate((t, live) => 30)
    .spawn((p, rng, i) => {
      p.vel = vec2(rng() * 20 - 10, -100);
      p.size = 1 + i * 0.1;
      counters.burnedOut -= 1;
    });
