import { swarm } from "../swarm.grammar.js";

// A crowd on open ground that a lure draws in. A record on the lure input sets each agent's aim and pull (traits);
// its steers carry the agents toward the aim, a drag slows them, and the pull fades. Wind pushes everyone a little.
export default ($) => swarm("lure")
  .ground({ width: 240, height: 180 })
  .tick(1 / 20)
  .trait("aimx", { value: 0 })
  .trait("aimy", { value: 0 })
  .trait("pull", { value: 0 })
  .group("crowd", { count: 30, x: 40, y: 40, spread: 20, speed: 60 })
  .steer("wind", (a, dt) => {
    a.vx = a.vx + input.wind.x * dt;
    a.vy = a.vy + input.wind.y * dt;
  })
  .steer("aim", (a, dt) => {
    a.vx = a.vx + (a.aimx - a.x) * a.pull * 20 * dt;
    a.vy = a.vy + (a.aimy - a.y) * a.pull * 20 * dt;
  })
  .steer("drag", (a, dt) => {
    a.vx = a.vx * (1 - 6 * dt);
    a.vy = a.vy * (1 - 6 * dt);
  })
  .steer("fade", (a, dt) => {
    a.pull = a.pull * (1 - 0.5 * dt);
  })
  .answer((a, dt) => {
    if (lure != null) {
      a.aimx = lure.at.x;
      a.aimy = lure.at.y;
      a.pull = lure.strength;
    }
  });
