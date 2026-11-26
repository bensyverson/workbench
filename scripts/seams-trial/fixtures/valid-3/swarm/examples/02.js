import { swarm } from "../swarm.grammar.js";

// One group circling its home; each agent keeps its own heading and turns it a little every tick.
const TURN = 1.5;

export default ($) => swarm("ring")
  .param("speed", { value: 25, min: 0, max: 80 })
  .ground({ width: 200, height: 200 })
  .tick(1 / 30)
  .trait("heading", { value: 0 })
  .trait("laps", { value: 0 })
  .group("all", { count: 30, x: 100, y: 100, spread: 60, speed: 40 })
  .steer("circle", (a, dt) => {
    a.vx = Math.cos(a.heading) * $.speed;
    a.vy = Math.sin(a.heading) * $.speed;
  })
  .update((a, rng, dt) => {
    a.heading = a.heading + TURN * dt * (0.5 + rng());
    if (a.heading > 2 * Math.PI) { a.heading = a.heading - 2 * Math.PI; a.laps = a.laps + 1; }
  });
