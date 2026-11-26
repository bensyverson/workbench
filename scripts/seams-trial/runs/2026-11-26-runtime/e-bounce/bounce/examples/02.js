import { bounce } from "../bounce.grammar.js";

// No gravity: four balls keep flying, and each hit on a wall is a record on `hit`. Each ball counts its hits and
// slows a little as the count grows, never below a floor.
export default ($) => bounce("pinger")
  .param("floor", { value: 40, min: 10, max: 200 })
  .box({ width: 200, height: 100 })
  .prop("hits", { value: 0 })
  .ball("a", { x: 20, y: 20, vx: 110, vy: 70, r: 5 })
  .ball("b", { x: 180, y: 80, vx: -90, vy: -60, r: 7 })
  .ball("c", { x: 100, y: 50, vx: 60, vy: -120, r: 3 })
  .ball("d", { x: 60, y: 70, vx: -130, vy: 40, r: 4 })
  .rebound((b) => {
    b.hits = b.hits + 1;
    const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
    const keep = Math.max($.floor / Math.max(speed, 1), 0.97);
    b.vx = b.vx * Math.min(keep, 1);
    b.vy = b.vy * Math.min(keep, 1);
  });
