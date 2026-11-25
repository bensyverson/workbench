import { particles } from "../particles.grammar.js";

// Counters: bumped in spawn and update with `++` and with `+= <number expression>`
// (`p.size` included), read in rate; a declared counter nobody uses is fine.
// Counters appear nowhere else (no force, no helper).
export default ($) => particles("tally")
  .param("budget", { value: 500, min: 0, max: 5000 })
  .bounds({ width: 300, height: 300 })
  .maxParticles(400)
  .field("heat", { value: 1 })
  .counter("spawned")
  .counter("weight")
  .counter("burned")
  .counter("unused")
  .force("fall", (p, dt) => { p.vel = p.vel + vec2(0, 40) * dt; })
  .update((p, dt) => {
    p.heat = p.heat - dt;
    if (p.heat <= 0) {
      p.kill();
      counters.burned++;
      counters.weight += p.size;
    }
  })
  .emitter("src", { x: 150, y: 150, maxRate: 100 })
    .rate((t, live) => (counters.spawned < $.budget ? 100 : 10 + Math.min(counters.burned, 50)))
    .spawn((p, rng) => {
      counters.spawned++;
      p.size = 1 + rng();
      counters.weight += 2 * p.size + rng();
      p.vel = vec2(rng() - 0.5, rng() - 0.5) * 60;
    })
  .emitter("refill", { x: 150, y: 50, maxRate: 30 })
    .rate((t, live) => (counters.weight > 100 && live < 20 ? 30 : 0))
    .spawn((p) => { counters.spawned += 1; p.life = 2; });
