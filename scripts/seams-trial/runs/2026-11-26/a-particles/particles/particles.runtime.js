import { defineRuntime } from "kit/define";
import { particles } from "./particles.grammar.js";

const DEFAULT_TICK = 1 / 60;
const DEFAULT_LIFE = 1; // seconds, until spawn or update says otherwise
const DEFAULT_SIZE = 1;
const DEFAULT_COUNT = 20; // particles per record for an emitter with on and no count
const BURST_MAX = 256;

// The root's force lambdas by name: their ids end in the call's place, which orders them like record.forces.
const forceKernels = (record, kernels) => {
  const place = (id) => Number(id.slice(id.lastIndexOf("#") + 1));
  const ids = Object.keys(kernels).filter((id) => id.startsWith(`${record.name}.force#`)).sort((a, b) => place(a) - place(b));
  const byName = {};
  Object.keys(record.forces ?? {}).forEach((n, k) => { byName[n] = kernels[ids[k]]; });
  return byName;
};

const inBox = (point, bounds) => point[0] >= 0 && point[0] <= bounds.width && point[1] >= 0 && point[1] <= bounds.height;

// The object a lambda is handed, made from a stored particle.
// 'killed' is outside the object, so that no .field name can collide with it.
const open = (stored, fieldNames, killed = new Set()) => {
  const p = {
    pos: [stored.x, stored.y], vel: [stored.vx, stored.vy],
    age: stored.age, life: stored.life, size: stored.size,
    kill: () => { killed.add(p); },
  };
  fieldNames.forEach((n, k) => { p[n] = stored.fields[k]; });
  return p;
};

const close = (p, emitter, fieldNames) => ({
  x: p.pos[0], y: p.pos[1], vx: p.vel[0], vy: p.vel[1],
  age: p.age, life: p.life, size: p.size,
  emitter,
  fields: fieldNames.map((n) => p[n]),
});

export const particlesRuntime = defineRuntime(particles, {
  clock: (record) => ({ tick: record.tick ?? DEFAULT_TICK }),
  init: (record) => ({
    t: 0,
    maxParticles: record.maxParticles,
    bounds: { width: record.bounds.width, height: record.bounds.height },
    particles: [],
    emitters: record.emitter.map((e) => ({ name: e.name, live: 0, carry: 0, born: 0 })),
    counters: Object.keys(record.counters ?? {}).map((n) => ({ name: n, value: 0 })),
  }),
  step(state, { record, T, dt, inputs, kernels, globals, rng }) {
    const fieldNames = Object.keys(record.fields ?? {});
    const forces = forceKernels(record, kernels);
    const allForces = Object.keys(forces);
    const counters = {};
    for (const c of state.counters) counters[c.name] = c.value;
    globals.counters = counters;

    const emitters = state.emitters.map((e) => ({ ...e, live: 0 }));
    const alive = [];
    const killed = new Set();

    // Age, force, move and update the particles that were alive.
    for (const stored of state.particles) {
      const p = open(stored, fieldNames, killed);
      const listed = record.emitter[stored.emitter].opts.forces ?? allForces;
      p.age = p.age + dt;
      for (const n of listed) forces[n](p, dt);
      p.pos = [p.pos[0] + p.vel[0] * dt, p.pos[1] + p.vel[1] * dt];
      if (kernels.update) kernels.update(p, dt);
      if (killed.has(p) || p.age >= p.life) continue;
      alive.push(close(p, stored.emitter, fieldNames));
      emitters[stored.emitter].live += 1;
    }

    // Make up to n particles from emitter k at (x, y), as far as the cap allows.
    const spawn = (k, n, x, y) => {
      const e = emitters[k];
      const kernel = kernels[`${e.name}.spawn`];
      for (let made = 0; made < n && alive.length < record.maxParticles; made++) {
        const fields = fieldNames.map((name) => record.fields[name].value);
        const p = open({ x, y, vx: 0, vy: 0, age: 0, life: DEFAULT_LIFE, size: DEFAULT_SIZE, fields }, fieldNames);
        kernel(p, rng, e.born);
        e.born += 1;
        e.live += 1;
        alive.push(close(p, k, fieldNames));
      }
    };

    const home = (opts) => (opts.follow !== undefined && inBox(inputs[opts.follow], record.bounds)
      ? inputs[opts.follow]
      : [opts.x, opts.y]);

    // This step's records, in order.
    for (const burst of inputs.burst) {
      record.emitter.forEach(({ opts }, k) => {
        if (opts.on === "burst") spawn(k, opts.count ?? DEFAULT_COUNT, burst.pos[0], burst.pos[1]);
      });
    }

    // Emission by rate, held to 0..maxRate particles a second.
    record.emitter.forEach(({ name, opts }, k) => {
      const e = emitters[k];
      const asked = kernels[`${name}.rate`](T, e.live);
      const rate = asked > 0 ? Math.min(asked, opts.maxRate) : 0;
      // The small addition keeps a rate such as 30 a second at 30 ticks from losing a particle to rounding.
      const owed = e.carry + rate * dt;
      const n = Math.floor(owed + 1e-9);
      e.carry = Math.max(0, owed - n);
      const [x, y] = home(opts);
      spawn(k, n, x, y);
    });

    return {
      ...state,
      t: T + dt,
      particles: alive,
      emitters,
      counters: state.counters.map((c) => ({ name: c.name, value: counters[c.name] })),
    };
  },
  events: { in: { burst: BURST_MAX } },
});
