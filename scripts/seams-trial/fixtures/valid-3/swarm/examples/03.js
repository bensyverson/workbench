import { swarm } from "../swarm.grammar.js";

// A swarm that answers a lure: each agent is startled when a call arrives, and calms down over two seconds.
export default ($) => swarm("hive")
  .param("calm", { value: 0.5, min: 0, max: 2 })
  .ground({ width: 200, height: 150 })
  .tick(1 / 20)
  .trait("alarm", { value: 0 })
  .group("workers", { count: 50, x: 100, y: 75, spread: 70, speed: 25 })
  .steer("settle", (a, dt) => {
    a.vx = a.vx * (1 - $.calm * dt);
    a.vy = a.vy * (1 - $.calm * dt);
  })
  .update((a, rng, dt) => {
    if (call != null) { a.alarm = call.pull; }
    a.alarm = Math.max(0, a.alarm - 0.5 * dt);
    a.vx = a.vx + (rng() - 0.5) * 30 * dt;
    a.vy = a.vy + (rng() - 0.5) * 30 * dt;
  });
