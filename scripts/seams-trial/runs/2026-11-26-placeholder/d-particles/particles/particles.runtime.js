import { defineRuntime } from "kit/define";
import { particles } from "./particles.grammar.js";

const PHI = 0.6180339887498949;

// The kernel ids of one repeatable slot ("<instance>.<slot>#n"), sorted by n: the Program's calls in order.
const callsOf = (kernels, prefix) =>
  Object.keys(kernels)
    .filter((id) => id.startsWith(prefix))
    .sort((a, b) => Number(a.slice(prefix.length)) - Number(b.slice(prefix.length)));

export const particlesRuntime = defineRuntime(particles, {
  clock: (record) => ({ tick: record.tick ?? 1 / 30 }),

  init(record) {
    if (Object.keys(record.fields ?? {}).length > 0) {
      // The run's state is fixed by the Dialect, and has no place for a Program's own .field values.
      throw new Error("particles: a .field() value cannot be kept between steps: the Dialect's state has no place for it");
    }
    return {
      t: 0,
      maxParticles: record.maxParticles,
      bounds: { width: record.bounds.width, height: record.bounds.height },
      particles: [],
      emitters: (record.emitter ?? []).map((e) => ({ name: e.name, live: 0, acc: 0 })),
      counters: Object.keys(record.counters ?? {}).map((name) => ({ name, value: 0 })),
    };
  },

  step(state, ctx) {
    const { T, dt, record, inputs, kernels, globals } = ctx;
    const ems = record.emitter ?? [];

    // The run's seed: the kit does not read .seed(), so mix it into what the lambdas draw.
    const salt = ((record.seed ?? 0) * PHI) % 1;
    const rng = () => (ctx.rng() + salt) % 1;

    // The Program's forces, by name, from the Program's own calls in order.
    const forceNames = Object.keys(record.forces ?? {});
    const forceIds = callsOf(kernels, `${record.name}.force#`);
    const force = Object.fromEntries(forceNames.map((n, i) => [n, kernels[forceIds[i]]]));

    const counters = Object.fromEntries(state.counters.map((c) => [c.name, c.value]));
    globals.counters = counters;

    // Particles as the lambdas see them: members in place, `kill` a function we supply.
    const make = (em, pos, p = {}) => {
      const o = {
        pos: pos.slice(), vel: p.vel ?? [0, 0], age: p.age ?? 0, life: p.life ?? 0, size: p.size ?? 1, dead: false,
      };
      o.kill = () => { o.dead = true; };
      return { em, o };
    };
    const pool = state.particles.map((p) => make(p.em, [p.x, p.y], { vel: [p.vx, p.vy], age: p.age, life: p.life, size: p.size }));
    const cap = state.maxParticles;

    const spawn = (k, at, i) => {
      if (pool.length >= cap) return;
      const e = ems[k];
      const p = make(k, [e.opts.x, e.opts.y]);
      // A spawn lambda may read the Event's record as `pickup`; a rate-driven one has none, so it gets its emitter's place.
      globals.pickup = at;
      kernels[`${e.name}.spawn`](p.o, rng, i);
      pool.push(p);
    };

    // Rate-driven emitters: spawn by rate, capped by maxRate, with a fractional accumulator kept in the state.
    const live = ems.map(() => 0);
    for (const p of pool) live[p.em] += 1;
    const acc = state.emitters.map((x) => x.acc);
    ems.forEach((e, k) => {
      if (e.opts.from !== undefined) return;
      const want = kernels[`${e.name}.rate`](T, live[k]);
      acc[k] += Math.min(Math.max(0, want), e.opts.maxRate) * dt;
      const n = Math.floor(acc[k]);
      acc[k] -= n;
      for (let i = 0; i < n; i++) spawn(k, { at: [e.opts.x, e.opts.y] }, i);
    });

    // Event-driven emitters: each record this step makes a burst of the emitters that name the input.
    for (const r of inputs.pickup ?? []) {
      ems.forEach((e, k) => {
        if (e.opts.from !== "pickup") return;
        for (let i = 0; i < (e.opts.burst ?? 1); i++) spawn(k, r, i);
      });
    }

    // Each particle: age, then the spawn-time values it has, its emitter's forces, the update, and the move.
    for (const p of pool) {
      if (!p.o.dead) p.o.age += dt;
    }
    for (const p of pool) {
      const e = ems[p.em];
      for (const n of e.opts.forces ?? []) force[n]?.(p.o, dt);
      kernels.update?.(p.o, dt);
      p.o.pos = [p.o.pos[0] + p.o.vel[0] * dt, p.o.pos[1] + p.o.vel[1] * dt];
    }

    const alive = pool.filter(({ o }) => !o.dead && !(o.life > 0 && o.age >= o.life));
    const count = ems.map(() => 0);
    for (const p of alive) count[p.em] += 1;

    return {
      ...state,
      t: T,
      particles: alive.map(({ em, o }) => ({
        x: o.pos[0], y: o.pos[1], vx: o.vel[0], vy: o.vel[1], age: o.age, life: o.life, size: o.size, em,
      })),
      emitters: ems.map((e, k) => ({ name: e.name, live: count[k], acc: acc[k] })),
      counters: state.counters.map((c) => ({ name: c.name, value: counters[c.name] })),
    };
  },

  events: { in: { pickup: 8 } },
});
