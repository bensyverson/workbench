import { bounce } from "../bounce.grammar.js";

// Two balls with no gravity: each speeds up a little at every wall, up to a cap, and counts its own walls.
export default ($) => bounce("court")
  .param("boost", { value: 1.05, min: 1, max: 1.5 })
  .box({ width: 100, height: 60 })
  .tick(1 / 20)
  .prop("walls", { value: 0 })
  .ball("one", { x: 20, y: 20, vx: 60, vy: 35, r: 3 })
  .ball("two", { x: 70, y: 40, vx: -45, vy: 50, r: 5 })
  .rebound((b) => {
    b.walls = b.walls + 1;
    if (Math.abs(b.vx) < 120) { b.vx = b.vx * $.boost; b.vy = b.vy * $.boost; }
  });
