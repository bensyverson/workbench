import { particles } from "../particles.grammar.js";

// Compound assignment on vectors where the operation is legal:
// `p.vel += v`, `p.vel *= n`, `p.vel /= n`, `p.pos += v`, `p.vel -= v`,
// on a `let` local vector, and `+=` on a `let` vector's component;
// negating a vector (`-p.vel`).
export default ($) => particles("vector-compound")
  .bounds({ width: 400, height: 300 })
  .maxParticles(300)
  .force("pull", (p, dt) => { p.vel += vec2(0, 50) * dt; })
  .force("damp", (p, dt) => { p.vel *= 1 - 0.3 * dt; })
  .update((p, dt) => {
    p.pos += vec2(0.5, 0) * dt;
    p.vel /= 1.001;
    let v = p.vel;
    v -= vec2(1, 1);
    v *= 2;
    v.x += 1;
    p.size = 1 + length(v) / 100;
  })
  .emitter("spout", { x: 200, y: 150, maxRate: 60 })
    .rate(() => 60)
    .spawn((p, rng) => {
      p.vel = vec2(10, -40);
      p.vel -= vec2(rng() * 5, 0);
      p.vel = -p.vel;
    });
