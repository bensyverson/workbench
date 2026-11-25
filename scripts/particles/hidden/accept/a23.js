import { particles } from "../particles.grammar.js";

// The newly listed operators and statements: `&&` `||` `!`, `else` and
// `else if`, `!==`, `%` and `%=`, unary minus on a number and a vector,
// `++` and `--` on numbers, a bare `return;` in a force, update and spawn;
// booleans in `const` locals and as a helper's result.
const isWarm = (h) => h > 0.5 && h <= 2;
const wrap = (x, m) => x % m;

export default ($) => particles("operators")
  .param("gust", { value: 10, min: -50, max: 50 })
  .bounds({ width: 300, height: 300 })
  .maxParticles(300)
  .field("heat", { value: 1 })
  .field("phase", { value: 0 })
  .force("gust", (p, dt) => {
    if (!isWarm(p.heat)) { return; }
    p.vel = p.vel + vec2(-$.gust, 0) * dt;
  })
  .update((p, dt) => {
    const cold = p.heat < 0.1;
    const lost = p.pos.x < 1 || p.pos.y < 1;
    p.phase++;
    p.phase %= 8;
    if (cold && !lost) {
      p.kill();
      return;
    } else if (p.phase !== 1) {
      p.size = 1 + wrap(p.phase, 3);
    } else {
      p.size = -(-2);
    }
    p.heat -= dt;
  })
  .emitter("puffs", { x: 150, y: 150, maxRate: 50 })
    .rate((t, live) => 50)
    .spawn((p, rng, i) => {
      let n = 10;
      n--;
      p.vel = -vec2(rng() * n, 40);
      if (i % 2 === 0) { return; }
      p.size = 2;
    });
