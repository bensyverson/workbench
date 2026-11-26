import { defineRuntime } from "kit/define";
import { particles } from "./particles.grammar.js";

// The most particles one emitter's burst spawns when its opts give no `burst`.
const BURST_DEFAULT = 10;

// Internal tags on a particle object. Symbols, so a Program field of the same name cannot collide with them.
const EMITTER = Symbol("emitter");
const DEAD = Symbol("dead");

// Forces are root slots called many times, so their kernels are ids `<root>.force#<place>` (runtime.md), where
// place counts all of the root's calls from 0 in call order. The record keeps them by name, in call order.
// Match the two in order, and fail loudly if the counts disagree.
const forceKernels = (kernels, part, record) => {
  const ids = Object.keys(kernels)
    .filter((id) => id.startsWith(`${part}.force#`))
    .sort((a, b) => Number(a.slice(a.indexOf("#") + 1)) - Number(b.slice(b.indexOf("#") + 1)));
  const names = Object.keys(record.forces ?? {});
  if (ids.length !== names.length) throw new Error(`forces: ${names.length} declared, ${ids.length} kernels (${ids.join(", ")})`);
  return Object.fromEntries(names.map((n, i) => [n, kernels[ids[i]]]));
};

export const particlesRuntime = defineRuntime(particles, {
  clock: (record) => ({ tick: record.tick ?? 1 / 60 }),
  init: (record) => ({
    t: 0,
    maxParticles: record.maxParticles,
    bounds: { width: record.bounds.width, height: record.bounds.height },
    particles: [],
    emitters: record.emitter.map((e) => ({ name: e.name, live: 0, carry: 0 })),
    counters: Object.keys(record.counters ?? {}).map((name) => ({ name, value: 0 })),
  }),
  step(state, ctx) {
    const { T, dt, record, inputs, kernels, globals, rng } = ctx;
    const counters = Object.fromEntries(state.counters.map((c) => [c.name, c.value]));
    globals.counters = counters;
    const fieldDefaults = Object.fromEntries(Object.entries(record.fields ?? {}).map(([n, f]) => [n, f.value]));
    const fieldNames = Object.keys(fieldDefaults);
    const emitterOpts = Object.fromEntries(record.emitter.map((e) => [e.name, e.opts]));
    const forceFns = forceKernels(kernels, ctx.part, record);
    const forcesOf = (emitterName) => (emitterOpts[emitterName]?.forces ?? []).map((f) => forceFns[f]);

    // A particle as the lambdas see it. kill() marks it; the step drops it.
    const makeParticle = (fields) => {
      const p = { ...fields, kill: () => { p[DEAD] = true; } };
      return p;
    };
    const toParticle = (s) => makeParticle({
      pos: [s.x, s.y], vel: [s.vx, s.vy], age: s.age, life: s.life, size: s.size,
      ...Object.fromEntries(s.fields.map((f) => [f.name, f.value])),
      [EMITTER]: s.emitter,
    });
    const fromParticle = (p, emitter) => ({
      x: p.pos[0], y: p.pos[1], vx: p.vel[0], vy: p.vel[1], age: p.age, life: p.life, size: p.size, emitter,
      fields: fieldNames.map((n) => ({ name: n, value: p[n] })),
    });
    const spawnOne = (emitter, pos, i) => {
      const p = makeParticle({ ...fieldDefaults, pos: [pos[0], pos[1]], vel: [0, 0], age: 0, life: 1, size: 1, [EMITTER]: emitter });
      kernels[`${emitter}.spawn`](p, rng, i);
      return p;
    };

    // 1. Particles age, are pushed by their emitter's forces, move, run update, and die.
    const particlesNow = [];
    for (const s of state.particles) {
      const p = toParticle(s);
      p.age = p.age + dt;
      for (const force of forcesOf(s.emitter)) force(p, dt);
      p.pos = [p.pos[0] + p.vel[0] * dt, p.pos[1] + p.vel[1] * dt];
      if (kernels.update !== undefined) kernels.update(p, dt);
      if (!p[DEAD] && p.age < p.life) particlesNow.push(p);
    }
    const live = (name) => particlesNow.filter((p) => p[EMITTER] === name).length;

    // 2. Emitters spawn: by rate (capped by maxRate), and a burst per record of the Event input they name.
    const spawned = [];
    const emitters = state.emitters.map((e) => ({ ...e }));
    const emitterOf = (name) => record.emitter.find((e) => e.name === name);
    for (const em of emitters) {
      const e = emitterOf(em.name);
      const rate = Math.min(kernels[`${em.name}.rate`](state.t, live(em.name)), e.opts.maxRate);
      em.carry = em.carry + Math.max(0, rate) * dt;
      const n = Math.floor(em.carry);
      em.carry = em.carry - n;
      for (let i = 0; i < n; i++) spawned.push(spawnOne(em.name, [e.opts.x, e.opts.y], i));
      if (e.opts.on !== undefined) {
        for (const rec of inputs[e.opts.on] ?? []) {
          const count = e.opts.burst ?? BURST_DEFAULT;
          for (let i = 0; i < count; i++) spawned.push(spawnOne(em.name, rec.pos, i));
        }
      }
    }
    particlesNow.push(...spawned);

    // 3. Back to the state: the living particles, each emitter's count, and the counters the lambdas bumped.
    const nowLive = (name) => particlesNow.filter((p) => p[EMITTER] === name).length;
    return {
      ...state,
      t: T,
      particles: particlesNow.map((p) => fromParticle(p, p[EMITTER])),
      emitters: emitters.map((e) => ({ ...e, live: nowLive(e.name) })),
      counters: state.counters.map((c) => ({ name: c.name, value: counters[c.name] })),
    };
  },
  events: { in: { burst: 16 } },
});
