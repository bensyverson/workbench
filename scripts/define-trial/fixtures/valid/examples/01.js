import { program } from "../data.grammar.js";

export default ($) => program("glow")
  .param("speed", { value: 2, min: 0, max: 8 })
  .tags("warm", "slow")
  .const("RING", "0.3 + HALF * 0.1")
  .fn("ring", (d, r) => {
    const w = 0.01;
    return floor(d / r) * w;
  })
  .layer("halo", { speed: "speed" })
  .channel("glow", (c, u) => c.base * sin(u.t * $.speed))
  .channel("pulse", (c, u) => c.glow + c.base)
  .mute("glow")
  .layer("echo", { speed: "speed", from: "halo" })
  .channel("late", (c, u) => c.pulse * 0.5)
  .pixel((uv, u) => {
    let c = color(0, 0, 0);
    for (let i = 0; i < 3; i++) {
      const p = uv - vec2(HALF, HALF);
      c = mix(c, color(1, 0.8, 0.2), ring(pmod(p.x, 1), RING));
    }
    return c;
  });
