import { swarm } from "../swarm.grammar.js";

// A flock that milles about its home and answers lures by temperament: bold agents go sooner and harder, and each
// grows used to being called, then recovers. The wind input drifts them and pace scales their speed.
export default ($) => swarm("callers")
  .ground({ width: 240, height: 180 })
  .tick(1 / 20)
  .trait("bold", { value: 0.8 })
  .trait("heard", { value: 0 })
  .group("flock", { count: 50, x: 70, y: 70, spread: 35, speed: 45 })
  .steer("home", (a, dt) => {
    a.vx = a.vx + (a.hx - a.x) * 0.3 * dt;
    a.vy = a.vy + (a.hy - a.y) * 0.3 * dt;
  })
  .update((a, rng, dt) => {
    a.vx = a.vx + (rng() - 0.5) * 30 * dt;
    a.vy = a.vy + (rng() - 0.5) * 30 * dt;
    a.bold = Math.min(1, Math.max(0.2, a.bold + (rng() - 0.5) * dt));
    a.heard = Math.max(0, a.heard - 0.1 * dt);
  })
  .heed((a, rng, dt) => {
    if (lure == null) return;
    const dx = lure.at.x - a.x;
    const dy = lure.at.y - a.y;
    const d = Math.max(1, Math.sqrt(dx * dx + dy * dy));
    const pull = 200 * lure.strength * a.bold / (1 + a.heard);
    a.vx = a.vx + (dx / d) * pull * dt;
    a.vy = a.vy + (dy / d) * pull * dt;
    a.heard = a.heard + 0.05 * dt;
  });
