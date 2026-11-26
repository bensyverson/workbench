import { bounce } from "../bounce.grammar.js";

// Three balls that fall, lose a little speed at each wall, and count their own rebounds.
export default ($) => bounce("tank")
  .param("gravity", { value: 60, min: 0, max: 400 })
  .param("loss", { value: 0.9, min: 0.5, max: 1 })
  .box({ width: 160, height: 120 })
  .tick(1 / 30)
  .prop("knocks", { value: 0 })                             // a number every ball carries
  .ball("red", { x: 30, y: 30, vx: 70, vy: 0, r: 6 })
  .ball("blue", { x: 120, y: 60, vx: -40, vy: 50, r: 8 })
  .ball("green", { x: 80, y: 100, vx: 25, vy: -90, r: 4 })
  .drift((b, dt) => { b.vy = b.vy + $.gravity * dt; })
  .rebound((b) => {
    b.knocks = b.knocks + 1;
    b.vx = b.vx * $.loss;
    b.vy = b.vy * $.loss;
  });
