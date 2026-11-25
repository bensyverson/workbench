import { particles } from "../particles.grammar.js";

const RISE = 40;
const N = 3;
const wobble = (t, amount) => Math.sin(t * 3) * amount;
function cool(heat, dt) {
  let h = heat - dt * 0.8;
  if (h < 0) { h = 0; }
  return h;
}
const drift = (p) => vec2(0, -RISE) + p.vel * 0;

export default ($) => {
  const sys = particles("campfire")
    .param("cap", { value: 300, min: 10, max: 2000 })
    .param("wind", { value: 10, min: -50, max: 50 })
    .bounds({ width: 320.5, height: 240 })
    .maxParticles($.cap)
    .seed(7)
    .field("heat", { value: 1 })
    .field("phase", { value: 0 })
    .counter("sparks")
    .counter("smoke");
  for (let k = 0; k < N; k++) {
    sys.emitter("flame" + k, { x: 100 + k * 60, y: 240, maxRate: 120, forces: [] })
      .rate((t, live) => (live < 80 ? 40 + wobble(t, 10) : 0))
      .spawn((p, rng, i) => {
        p.vel = vec2((rng() - 0.5) * 30, -60 - rng() * 40);
        p.phase = rng() * Math.PI * 2;
        p.life = 1 + rng() * 0.5;
        counters.sparks++;
      });
  }
  sys.force("lift", (p, dt) => { p.vel = p.vel + drift(p) * dt; });
  sys.force("wind", (p, dt) => {
    let v = p.vel;
    v.x = v.x + $.wind * dt;
    p.vel = v;
  });
  if ($.cap > 100) {
    sys.emitter("smoke", { x: 0, y: 0, maxRate: 10, forces: ["wind"] })
      .rate((t, live) => {
        if (counters.sparks > 50) { return 5; }
        return counters.smoke < 10 ? 2 : 0;
      })
      .spawn((p, rng) => { p.size = 4; p.pos = vec2(160, 200); counters.smoke += p.size; });
  }
  sys.update((p, dt) => {
    p.heat = cool(p.heat, dt);
    p.size = Math.max(0.5, 1 + p.heat * 2, length(p.vel) / 100);
    const off = p.pos.x < 0 || p.pos.x > 320.5;
    if (off) { p.kill(); return; }
    for (let k = 0; k < 4; k++) {
      if (k === 2) { break; }
      p.phase += 0.1;
    }
    p.phase %= Math.PI * 2;
    if (p.heat === 0 && !off) { p.kill(); counters.smoke++; }
  });
  return sys;
};
