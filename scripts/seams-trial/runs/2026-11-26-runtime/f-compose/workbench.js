// workbench.js: balls fly in a box; each time one meets a wall, the swarm's agents are drawn to that point.
import { compose } from "kit/compose";
import { bounce } from "bounce";
import { swarm } from "swarm";

export default ($) => {
  // The box: two balls that fall under gravity and lose speed at each wall.
  const box = bounce("box")
    .param("gravity", { value: 60, min: 0, max: 400 })
    .param("loss", { value: 0.9, min: 0.5, max: 1 })
    .box({ width: 160, height: 120 })
    .tick(1 / 30)
    .prop("knocks", { value: 0 })
    .ball("ember", { x: 30, y: 30, vx: 70, vy: 0, r: 6 })
    .ball("slate", { x: 120, y: 60, vx: -40, vy: 50, r: 8 })
    .drift((b, dt) => { b.vy = b.vy + $.gravity * dt; })
    .rebound((b) => {
      b.knocks = b.knocks + 1;
      b.vx = b.vx * $.loss;
      b.vy = b.vy * $.loss;
    });

  // The swarm: a crowd on open ground that a lure draws in. Each lure record sets every agent's aim and pull.
  const crowd = swarm("crowd")
    .ground({ width: 240, height: 180 })
    .tick(1 / 20)
    .trait("aimx", { value: 0 })
    .trait("aimy", { value: 0 })
    .trait("pull", { value: 0 })
    .group("crowd", { count: 30, x: 40, y: 40, spread: 20, speed: 120 })
    .steer("aim", (a, dt) => {
      a.vx = a.vx + (a.aimx - a.x) * a.pull * 40 * dt;
      a.vy = a.vy + (a.aimy - a.y) * a.pull * 40 * dt;
    })
    .steer("drag", (a, dt) => {
      a.vx = a.vx * (1 - 1.5 * dt);
      a.vy = a.vy * (1 - 1.5 * dt);
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
    })
    .update((a, rng, dt) => {
      a.vx = a.vx + (rng() - 0.5) * 10 * dt;
      a.vy = a.vy + (rng() - 0.5) * 10 * dt;
    });

  return compose("box-and-crowd")
    .part(box)
    .part(crowd)
    .frame(box.frame.box, crowd.frame.ground, "fit")
    .wire(box.out.wallHit, crowd.in.lure, { overflow: "keepLast" })
    .show(crowd);
};
