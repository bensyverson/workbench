import { defineRuntime } from "kit/define";
import { particles } from "./particles.grammar.js";

const DEFAULT_TICK = 1 / 60;   // seconds, when the Program has no .tick
const DEFAULT_LIFE = 5;        // seconds, until spawn or update writes p.life
const DEFAULT_SIZE = 1;

/** The kernels of the repeatable .force slot, by force name: ids "<root>.force#n", matched to record.forces in order. */
function forceKernels(record, kernels) {
  const prefix = `${record.name}.force#`;
  const ids = Object.keys(kernels)
    .filter((id) => id.startsWith(prefix))
    .sort((a, b) => Number(a.slice(prefix.length)) - Number(b.slice(prefix.length)));
  return Object.fromEntries(Object.keys(record.forces).map((name, k) => [name, kernels[ids[k]]]));
}

export const particlesRuntime = defineRuntime(particles, {
  clock: (record) => ({ tick: record.tick ?? DEFAULT_TICK }),

  init: (record) => ({
    t: 0,
    maxParticles: record.maxParticles,
    bounds: { width: record.bounds.width, height: record.bounds.height },
    particles: [],
    emitters: record.emitter.map((e) => ({ name: e.name, live: 0, due: 0, spawned: 0 })),
    counters: Object.keys(record.counters).map((name) => ({ name, value: 0 })),
  }),

  step(state, { record, T, dt, inputs, kernels, globals, rng }) {
    const fieldNames = Object.keys(record.fields);
    const forces = forceKernels(record, kernels);
    const emitters = record.emitter;
    const counters = Object.fromEntries(state.counters.map((c) => [c.name, c.value]));
    globals.counters = counters;

    // .seed(n) rotates the part's stream: still in [0, 1), and a replay is still exact.
    const shift = ((record.seed ?? 0) * 0.6180339887498949) % 1;
    const random = () => (rng() + shift) % 1;

    const live = emitters.map(() => 0);
    const next = [];

    const store = (p, e) => ({
      x: p.pos[0], y: p.pos[1], vx: p.vel[0], vy: p.vel[1], age: p.age, life: p.life, size: p.size, e,
      values: fieldNames.map((n) => p[n]),
    });

    // 1. The living age, feel their forces, move, update, and die.
    for (const q of state.particles) {
      let dead = false;
      const p = {
        pos: [q.x, q.y], vel: [q.vx, q.vy], age: q.age + dt, life: q.life, size: q.size,
        kill: () => { dead = true; },
      };
      fieldNames.forEach((n, k) => { p[n] = q.values[k]; });
      for (const name of emitters[q.e].opts.forces ?? Object.keys(record.forces)) forces[name](p, dt);
      p.pos = [p.pos[0] + p.vel[0] * dt, p.pos[1] + p.vel[1] * dt];
      if (kernels.update) kernels.update(p, dt);
      if (dead || p.age >= p.life) continue;
      next.push(store(p, q.e));
      live[q.e] += 1;
    }

    const spawned = state.emitters.map((s) => s.spawned);
    const spawn = (e, at, burst) => {
      const p = {
        pos: [at[0], at[1]], vel: [0, 0], age: 0, life: DEFAULT_LIFE, size: DEFAULT_SIZE,
        kill: () => {},
      };
      for (const n of fieldNames) p[n] = record.fields[n].value;
      globals.burst = burst;
      kernels[`${emitters[e].name}.spawn`](p, random, spawned[e]);
      spawned[e] += 1;
      next.push(store(p, e));
      live[e] += 1;
    };

    // 2. Records make particles, before the rates, so a record is not starved by a steady stream.
    for (const r of inputs.burst) {
      emitters.forEach((em, e) => {
        if (em.opts.on !== "burst") return;
        for (let k = 0; k < em.opts.burst && next.length < record.maxParticles; k++) spawn(e, r.pos, r);
      });
    }

    // 3. Emitters spawn by their rate, capped at maxRate and maxParticles.
    const due = emitters.map((em, e) => {
      const wanted = kernels[`${em.name}.rate`](T, live[e]);
      const perSecond = wanted > 0 ? Math.min(wanted, em.opts.maxRate) : 0;
      const owed = state.emitters[e].due + perSecond * dt;
      const whole = Math.floor(owed + 1e-9);
      const at = [em.opts.x, em.opts.y];
      for (let k = 0; k < whole && next.length < record.maxParticles; k++) spawn(e, at, { pos: at });
      return Math.max(0, owed - whole);
    });

    return {
      ...state,
      t: T,
      particles: next,
      emitters: emitters.map((em, e) => ({ name: em.name, live: live[e], due: due[e], spawned: spawned[e] })),
      counters: state.counters.map((c) => ({ name: c.name, value: counters[c.name] })),
    };
  },

  events: { in: { burst: 256 } },
});
