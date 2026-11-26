import { compose } from "kit/compose";
import { bounce } from "bounce";
import { swarm } from "swarm";

// Each time a ball meets a wall, the swarm rushes to the point it touched, on a ground twice the box's size.
export default ($) => {
  const table = bounce("table")
    .box({ width: 160, height: 120 })
    .tick(1 / 30)
    .prop("hits", { value: 0 })
    .ball("cue", { x: 40, y: 40, vx: 55, vy: 30, r: 5 })
    .ball("eight", { x: 120, y: 80, vx: -35, vy: -45, r: 6 })
    .rebound((b) => { b.hits = b.hits + 1; });
  const gnats = swarm("gnats")
    .ground({ width: 320, height: 240 })
    .tick(1 / 20)
    .trait("buzz", { value: 0 })
    .group("cloud", { count: 60, x: 160, y: 120, spread: 90, speed: 40 })
    .steer("slow", (a, dt) => { a.vx = a.vx * (1 - 0.5 * dt); a.vy = a.vy * (1 - 0.5 * dt); })
    .update((a, rng, dt) => {
      if (call != null) { a.buzz = 1; }
      a.buzz = Math.max(0, a.buzz - dt);
    });

  return compose("wall-gnats")
    .part(table)
    .part(gnats)
    .frame(table.frame.box, gnats.frame.ground, "fit")
    .wire(table.out.wall, gnats.in.lure, { rename: { contact: "spot" }, overflow: "keepLast" })
    .show(gnats);
};
