import { defineRuntime } from "kit/define";
import { particles } from "./particles.grammar.js";

// The particles' runtime (added by leaf ZH4KWX to make the relay's particles runnable). One step: every particle
// ages and moves by its velocity, and dies past its life or outside the bounds; each emitter spawns by its rate,
// and an emitter whose trigger is an Event input spawns its whole maxRate once per record, at the record's `at`.
// Spawn lambdas set each new particle's fields; the kit passes them the seeded rng. A particle keeps its .field
// values in its state's `fields`, by name.

const inside = (p, b) => p.x >= 0 && p.y >= 0 && p.x <= b.width && p.y <= b.height;

export const particlesRuntime = defineRuntime(particles, {
  clock: (record) => ({ tick: record.tick ?? 1 / 30 }),
  init: (record) => ({
    t: 0, maxParticles: record.maxParticles, bounds: record.bounds, particles: [],
    emitters: (record.emitter ?? []).map((e) => ({ name: e.name, live: 0 })),
    counters: Object.keys(record.counters ?? {}).map((name) => ({ name, value: 0 })),
  }),
  step(state, { dt, record, kernels, inputs, rng, globals }) {
    const counters = Object.fromEntries(state.counters.map((c) => [c.name, c.value]));
    globals.counters = counters;
    const ps = state.particles
      .map((p) => ({ ...p, x: p.x + p.vx * dt, y: p.y + p.vy * dt, age: p.age + dt }))
      .filter((p) => p.age < p.life && inside(p, state.bounds));
    const live = {};
    for (const e of record.emitter ?? []) {
      const at = [];
      if (e.opts.trigger) for (const ev of inputs[e.opts.trigger] ?? []) for (let i = 0; i < e.opts.maxRate; i++) at.push(ev.at);
      const rate = kernels[`${e.name}.rate`](state.t, ps.length);
      for (let i = Math.floor(Math.min(rate, e.opts.maxRate) * dt + rng()); i > 0; i--) at.push([e.opts.x, e.opts.y]);
      live[e.name] = 0;
      for (const pos of at) {
        if (ps.length >= state.maxParticles) break;
        let dead = false;
        const p = { pos: [...pos], vel: [0, 0], age: 0, life: 1, size: 1, kill: () => { dead = true; } };
        for (const f of Object.keys(record.fields ?? {})) p[f] = record.fields[f].value;
        kernels[`${e.name}.spawn`](p, rng, state.t);
        const fields = Object.fromEntries(Object.keys(record.fields ?? {}).map((f) => [f, p[f]]));
        if (!dead) { ps.push({ x: p.pos[0], y: p.pos[1], vx: p.vel[0], vy: p.vel[1], age: 0, life: p.life, fields }); live[e.name] += 1; }
      }
    }
    return {
      ...state, t: state.t + dt, particles: ps,
      emitters: state.emitters.map((e) => ({ name: e.name, live: live[e.name] ?? 0 })),
      counters: state.counters.map((c) => ({ name: c.name, value: counters[c.name] })),
    };
  },
  // one burst record per coin the maze picks in a step: the maze's runtime pushes at most 8
  events: { in: { burst: 8 } },
});
