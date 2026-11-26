// Agents rush to wherever a ball meets a wall.
import { compose } from "kit/compose";
import { bounce } from "bounce";
import { swarm } from "swarm";

export default ($) => {
  // Two balls with no gravity and no loss: the rebounds keep coming, on all four walls.
  const court = bounce("court")
    .box({ width: 160, height: 120 })
    .tick(1 / 60)
    .ball("red", { x: 30, y: 40, vx: 67, vy: 41, r: 6 })
    .ball("blue", { x: 120, y: 80, vx: -43, vy: 59, r: 8 });

  // Each agent makes for the nearest live lure; with none, it mills about and drifts back home.
  const crowd = swarm("crowd")
    .ground({ width: 320, height: 240 })
    .tick(1 / 20)
    .trait("near", { value: 1000000 })                      // distance to the nearest lure seen this tick
    .group("runners", { count: 40, x: 90, y: 120, spread: 40, speed: 150 })
    .group("walkers", { count: 80, x: 230, y: 120, spread: 55, speed: 70 })
    .steer("home", (a, dt) => {
      a.vx = a.vx + (a.hx - a.x) * 0.8 * dt;
      a.vy = a.vy + (a.hy - a.y) * 0.8 * dt;
    })
    .update((a, rng, dt) => {
      a.near = 1000000;
      a.vx = a.vx * 0.96 + (rng() - 0.5) * 60 * dt;
      a.vy = a.vy * 0.96 + (rng() - 0.5) * 60 * dt;
    })
    .heed((a, rng, dt) => {
      if (lure == null) return;
      const dx = lure.at.x - a.x;
      const dy = lure.at.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < a.near) {
        a.near = d;
        a.vx = dx * 4 + (rng() - 0.5) * 60;
        a.vy = dy * 4 + (rng() - 0.5) * 60;
      }
    });

  return compose("rush")
    .part(court)
    .part(crowd)
    .frame(court.frame.box, crowd.frame.ground, "fit")
    .wire(court.out.hit, crowd.in.lure)
    .show(crowd);
};
