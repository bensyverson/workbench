import { swarm } from "../swarm.grammar.js";

// Two groups that wander and are pulled home; each agent tires as it moves and rests when it is spent.
export default ($) => swarm("meadow")
  .param("homing", { value: 0.4, min: 0, max: 2 })
  .ground({ width: 240, height: 180 })
  .tick(1 / 20)
  .trait("energy", { value: 1 })                            // a number every agent carries
  .group("east", { count: 40, x: 180, y: 90, spread: 40, speed: 30 })
  .group("west", { count: 25, x: 60, y: 90, spread: 30, speed: 20 })
  .steer("home", (a, dt) => {
    a.vx = a.vx + (a.hx - a.x) * $.homing * dt;
    a.vy = a.vy + (a.hy - a.y) * $.homing * dt;
  })
  .steer("tire", (a, dt) => {
    a.vx = a.vx * a.energy;
    a.vy = a.vy * a.energy;
  })
  .update((a, rng, dt) => {
    a.vx = a.vx + (rng() - 0.5) * 20 * dt;
    a.vy = a.vy + (rng() - 0.5) * 20 * dt;
    a.energy = Math.max(0.2, a.energy - 0.05 * dt);
    if (a.energy <= 0.2 && rng() < 0.1) a.energy = 1;
  });
