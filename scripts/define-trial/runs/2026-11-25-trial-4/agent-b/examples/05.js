import { particles } from "../particles.grammar.js";

const WIND = 25;
const bounce = (p) => (p.pos.y > 190 ? -0.5 : 1);
const sway = (t) => Math.sin(t * 2) * WIND;

export default ($) => particles("rain")
  .param("storm", { value: 1, min: 0, max: 2 })
  .bounds({ width: 400, height: 200 })
  .maxParticles(5000)
  .tick(1 / 60)
  .seed(3)
  .counter("splashes")
  .counter("drops")
  .update((p, dt) => {
    p.vel = vec2(p.vel.x, p.vel.y * bounce(p));
    for (let k = 0; k < 3; k++) { if (k === 1) { continue; } p.size = p.size * 0.99; }
    if (p.pos.y > 195) { p.kill(); counters.splashes++; }
  })
  .force("fall", (p, dt) => { p.vel = p.vel + vec2(WIND, 400) * dt; })
  .emitter("cloud", { x: 200, y: 0, maxRate: 600, forces: ["fall"] })
    .rate((t, live) => (counters.splashes < 5000 ? 200 * $.storm + sway(t) * 0 : 0))
    .spawn((p, rng, i) => {
      p.pos = vec2(rng() * 400, 0);
      p.life = 5;
      counters.drops += 1;
    });
