import { particles } from "../particles.grammar.js";

// An emitter's forces list names a force declared later in the Program
// ("Names may refer forward"); the .force call after the emitter's own
// calls acts on the Program ("any other call on it acts on the Program").
export default ($) => particles("late-force")
  .bounds({ width: 200, height: 200 })
  .maxParticles(100)
  .emitter("src", { x: 100, y: 100, maxRate: 40, forces: ["sink"] })
    .rate(() => 40)
    .spawn((p, rng) => { p.vel = vec2(rng() * 60 - 30, rng() * 60 - 30); })
  .force("sink", (p, dt) => { p.vel = p.vel + (vec2(100, 100) - p.pos) * dt; });
