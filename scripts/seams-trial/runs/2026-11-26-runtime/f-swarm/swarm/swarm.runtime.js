import { defineRuntime } from "kit/define";
import { swarm } from "./swarm.grammar.js";

// Each agent is one item of state.agents. A lambda is handed a plain object: the built-in members and the traits side by
// side. The runtime reads back only what a lambda may write (vx, vy and the traits) and keeps the rest.

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

const toObject = (a) => ({ x: a.x, y: a.y, vx: a.vx, vy: a.vy, hx: a.hx, hy: a.hy, age: a.age, ...a.traits });

function fromObject(obj, a, traitNames) {
  const traits = {};
  for (const n of traitNames) traits[n] = obj[n];
  return { ...a, vx: obj.vx, vy: obj.vy, traits };
}

const groupsOf = (record) => Object.entries(record.groups ?? {}).map(([name, g]) => ({ name, count: g.count }));

export const swarmRuntime = defineRuntime(swarm, {
  clock: (record) => ({ tick: record.tick ?? 1 / 30 }),

  // Agents start scattered around their group's home, inside the ground, at rest, with their traits at their declared values.
  init(record, { rng }) {
    const { width, height } = record.ground;
    const traitNames = Object.keys(record.traits ?? {});
    const agents = [];
    for (const g of Object.values(record.groups ?? {})) {
      for (let i = 0; i < g.count; i++) {
        const angle = 2 * Math.PI * rng();
        const r = g.spread * Math.sqrt(rng());
        const traits = {};
        for (const n of traitNames) traits[n] = record.traits[n].value;
        agents.push({
          x: clamp(g.x + r * Math.cos(angle), 0, width),
          y: clamp(g.y + r * Math.sin(angle), 0, height),
          vx: 0,
          vy: 0,
          hx: g.x,
          hy: g.y,
          age: 0,
          speed: g.speed,
          traits,
        });
      }
    }
    return { t: 0, ground: { width, height }, agents, groups: groupsOf(record) };
  },

  step(state, { T, dt, part, record, inputs, kernels, globals, rng }) {
    const { width, height } = state.ground;
    const traitNames = Object.keys(record.traits ?? {});
    const steers = Object.keys(record.steers ?? {}).map((n) => kernels[`${part}.steer.${n}`]);
    let agents = state.agents.map((a) => ({ ...a, traits: { ...a.traits } }));

    // 1. Each lure record, in order, is handed to the answer lambda of every agent. Its `lure` global is set first.
    const answer = kernels[`${part}.answer`];
    const update = kernels[`${part}.update`];
    if (answer) {
      for (const r of inputs.lure) {
        globals.lure = r;
        agents = agents.map((a) => {
          const obj = toObject(a);
          answer(obj, dt);
          return fromObject(obj, a, traitNames);
        });
      }
    }
    globals.lure = null;

    // 2. Every steer, then update, on every agent.
    agents = agents.map((a) => {
      const obj = toObject(a);
      for (const k of steers) k(obj, dt);
      if (update) update(obj, rng, dt);
      return fromObject(obj, a, traitNames);
    });

    // 3. Cap each velocity at the agent's group's speed, move by it, and keep the agent on the ground.
    agents = agents.map((a) => {
      let vx = a.vx, vy = a.vy;
      const sp = Math.hypot(vx, vy);
      if (sp > a.speed) { vx *= a.speed / sp; vy *= a.speed / sp; }
      let x = a.x + vx * dt, y = a.y + vy * dt;
      if (x < 0 || x > width) { x = clamp(x, 0, width); vx = -vx; }
      if (y < 0 || y > height) { y = clamp(y, 0, height); vy = -vy; }
      return { ...a, x, y, vx, vy, age: a.age + dt };
    });

    return { ...state, t: T + dt, agents, groups: groupsOf(record) };
  },

  events: { in: { lure: 16 } },
});
