import { bounce } from "../bounce.grammar.js";

// One ball thrown into the corner of a small box, with no tick given (the runtime's default, 1/30 s). It falls and
// meets the right wall and then the floor, and each prop it carries counts its own rebounds.
export default ($) => bounce("corner")
  .param("g", { value: 9.8, min: 0, max: 30 })
  .box({ width: 40, height: 40 })
  .prop("hits", { value: 0 })
  .ball("ember", { x: 36, y: 4, vx: 25, vy: -20, r: 3 })
  .drift((b, dt) => { b.vy = b.vy + $.g * dt; })
  .rebound((b) => { b.hits = b.hits + 1; });
