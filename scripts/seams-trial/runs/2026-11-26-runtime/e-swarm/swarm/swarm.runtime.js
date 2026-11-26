import { defineRuntime } from "kit/define";
import { swarm } from "./swarm.grammar.js";

const MAX_LURES = 16;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// The built-in answer to a lure: turn the velocity toward it (or away), by |strength|.
const answer = (a, lure, speed, dt) => {
  const dx = lure.at[0] - a.x;
  const dy = lure.at[1] - a.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  const s = clamp(lure.strength, -1, 1);
  const w = Math.abs(s);
  // toward the lure, slow enough not to overshoot it within one tick
  const k = d > 0 ? (s < 0 ? -speed : Math.min(speed, d / dt)) / d : 0;
  a.vx = a.vx * (1 - w) + dx * k * w;
  a.vy = a.vy * (1 - w) + dy * k * w;
};

export const swarmRuntime = defineRuntime(swarm, {
  clock: (record) => ({ tick: record.tick ?? 1 / 30 }),
  init: (record, { rng }) => {
    const { width, height } = record.ground;
    const own = {};
    for (const [n, t] of Object.entries(record.traits ?? {})) own[n] = t.value;
    const agents = [];
    const groups = [];
    for (const [name, g] of Object.entries(record.groups)) {
      groups.push({ name, count: g.count });
      for (let i = 0; i < g.count; i++) {
        // uniform over a disc of radius spread around the home
        const r = Math.sqrt(rng()) * Math.max(0, g.spread);
        const q = rng() * 2 * Math.PI;
        agents.push({
          x: clamp(g.x + r * Math.cos(q), 0, width),
          y: clamp(g.y + r * Math.sin(q), 0, height),
          vx: 0, vy: 0, hx: g.x, hy: g.y, age: 0, group: name,
          own: { ...own },
        });
      }
    }
    return { t: 0, ground: { width, height }, agents, groups, lures: [] };
  },
  step(state, { record, part, T, dt, inputs, kernels, globals, rng }) {
    const arrived = inputs.lure.map((r) => ({
      x: r.at[0], y: r.at[1], strength: r.strength, duration: r.duration,
      left: r.duration - (T - r.$T),
    }));
    const live = [...state.lures, ...arrived].filter((l) => l.left > 0).slice(-MAX_LURES);
    const lures = live.map((l) => ({ at: [l.x, l.y], strength: l.strength, duration: l.duration }));

    const steers = Object.keys(record.steers ?? {}).map((n) => kernels[`${part}.steer.${n}`]);
    const traits = Object.keys(record.traits ?? {});
    const pace = Math.max(0, inputs.pace);
    const { width, height } = state.ground;

    const agents = state.agents.map((agent) => {
      const speed = record.groups[agent.group].speed * pace;
      const a = { x: agent.x, y: agent.y, vx: agent.vx, vy: agent.vy, hx: agent.hx, hy: agent.hy, age: agent.age };
      for (const n of traits) a[n] = agent.own[n];

      for (const steer of steers) steer(a, dt);
      if (kernels.update) kernels.update(a, rng, dt);
      for (const lure of lures) {
        if (kernels.heed) {
          globals.lure = lure;
          kernels.heed(a, rng, dt);
        } else answer(a, lure, speed, dt);
      }

      let vx = a.vx;
      let vy = a.vy;
      const v = Math.sqrt(vx * vx + vy * vy);
      if (v > speed) {
        vx = (vx * speed) / v;
        vy = (vy * speed) / v;
      }
      const nx = agent.x + (vx + inputs.wind[0]) * dt;
      const ny = agent.y + (vy + inputs.wind[1]) * dt;
      const x = clamp(nx, 0, width);
      const y = clamp(ny, 0, height);
      // an agent at the edge loses the part of its velocity that pushed it off
      if (x !== nx) vx = 0;
      if (y !== ny) vy = 0;

      const own = {};
      for (const n of traits) own[n] = a[n];
      return { x, y, vx, vy, hx: agent.hx, hy: agent.hy, age: agent.age + dt, group: agent.group, own };
    });

    return {
      ...state,
      t: T + dt,
      agents,
      lures: live.map((l) => ({ ...l, left: l.left - dt })).filter((l) => l.left > 0),
    };
  },
  events: { in: { lure: MAX_LURES } },
});
