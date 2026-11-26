import { defineRuntime } from "kit/define";
import { swarm } from "./swarm.grammar.js";

// One tick: the newest lure record, if one arrived, becomes the held lure (for HOLD seconds from the instant it
// was sent). Each agent runs every .steer in the Program's order, then update (which reads the record as `call`
// on the tick it arrives, null otherwise), turns toward a held lure, is capped at its group's speed, moves, and
// turns back at the ground's edges.

const HOLD = 3;
const MAX_LURES = 8;

/** @param {number} n @param {number} lo @param {number} hi */
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

export const swarmRuntime = defineRuntime(swarm, {
  clock: (record) => ({ tick: record.tick ?? 1 / 20 }),
  init: (record, { rng }) => {
    const traits = Object.fromEntries(Object.entries(record.traits ?? {}).map(([n, t]) => [n, t.value]));
    const agents = [];
    for (const [group, g] of Object.entries(record.groups)) {
      for (let i = 0; i < g.count; i++) {
        const angle = rng() * 2 * Math.PI, d = Math.sqrt(rng()) * g.spread;
        const x = clamp(g.x + Math.cos(angle) * d, 0, record.ground.width), y = clamp(g.y + Math.sin(angle) * d, 0, record.ground.height);
        agents.push({ x, y, vx: 0, vy: 0, hx: g.x, hy: g.y, age: 0, group, traits: { ...traits } });
      }
    }
    return { t: 0, ground: record.ground, agents, groups: Object.entries(record.groups).map(([name, g]) => ({ name, count: g.count })), lure: null };
  },
  step(state, { T, dt, part, record, kernels, inputs, rng, globals }) {
    const names = Object.keys(record.traits ?? {});
    const steers = Object.keys(record.steers ?? {}).map((n) => kernels[`${part}.steer.${n}`]);
    const calls = inputs.lure;
    const newest = calls.length ? calls[calls.length - 1] : null;
    let lure = newest ? { x: newest.spot[0], y: newest.spot[1], pull: clamp(newest.pull, 0, 2), since: newest.$T } : state.lure;
    if (lure && T - lure.since > HOLD) lure = null;
    globals.call = newest;
    const { width: w, height: h } = state.ground;
    const agents = state.agents.map((q) => {
      const a = { x: q.x, y: q.y, vx: q.vx, vy: q.vy, hx: q.hx, hy: q.hy, age: q.age, ...q.traits };
      for (const k of steers) k(a, dt);
      kernels.update?.(a, rng, dt);
      const speed = record.groups[q.group].speed;
      if (lure) {
        const dx = lure.x - a.x, dy = lure.y - a.y, d = Math.hypot(dx, dy);
        const k = Math.min(1, 4 * dt * lure.pull);
        if (d > 1) { a.vx += ((dx / d) * speed * 2 - a.vx) * k; a.vy += ((dy / d) * speed * 2 - a.vy) * k; }
      }
      const v = Math.hypot(a.vx, a.vy), cap = lure ? speed * 2 : speed;
      if (v > cap) { a.vx = (a.vx / v) * cap; a.vy = (a.vy / v) * cap; }
      let x = a.x + a.vx * dt, y = a.y + a.vy * dt;
      if (x < 0 || x > w) { x = clamp(x, 0, w); a.vx = -a.vx; }
      if (y < 0 || y > h) { y = clamp(y, 0, h); a.vy = -a.vy; }
      return { x, y, vx: a.vx, vy: a.vy, hx: q.hx, hy: q.hy, age: q.age + dt, group: q.group, traits: Object.fromEntries(names.map((n) => [n, a[n]])) };
    });
    return { ...state, t: state.t + dt, agents, lure };
  },
  events: { in: { lure: MAX_LURES } },
});
