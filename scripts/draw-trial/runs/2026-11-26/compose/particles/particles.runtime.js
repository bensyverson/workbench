import { defineRuntime } from "kit/define";
import { particles } from "./particles.grammar.js";

// One tick: every live particle ages, feels its emitter's forces, moves by its velocity and runs the update lambda;
// it dies when killed, past its life, or outside the box. Then each emitter spawns by its rate, and an emitter whose
// trigger is an Event input spawns perEvent particles at each record's position. Spawn lambdas read the record as
// `ev`; for a spawn by rate, `ev` is a record at the emitter, so a spawn lambda that reads it still has one.

const PER_EVENT = 20;
const MAX_RECORDS = 8; // burst records one tick takes; the most perEvent particles one tick can make is 8 × perEvent

const inside = (x, y, b) => x >= 0 && y >= 0 && x <= b.width && y <= b.height;

/**
 * The kernels of a slot a construct may call more than once, by the name each call declares, in the Program's
 * order. Their ids are `<instance>.<slot>#<n>`, n counting the instance's calls, which the record does not carry,
 * so they are matched to the record's names by order.
 */
function named(kernels, instance, slot, names) {
  const prefix = `${instance}.${slot}#`;
  const ids = Object.keys(kernels).filter((k) => k.startsWith(prefix)).sort((a, b) => Number(a.slice(prefix.length)) - Number(b.slice(prefix.length)));
  return Object.fromEntries(names.map((n, i) => [n, kernels[ids[i]]]));
}

export const particlesRuntime = defineRuntime(particles, {
  clock: (record) => ({ tick: record.tick ?? 1 / 30 }),
  init: (record) => ({
    t: 0, maxParticles: record.maxParticles, bounds: record.bounds, particles: [],
    emitters: record.emitter.map((e) => ({ name: e.name, live: 0 })),
    counters: Object.keys(record.counters ?? {}).map((name) => ({ name, value: 0 })),
  }),
  step(state, { part, dt, record, kernels, inputs, rng, globals }) {
    const fieldNames = Object.keys(record.fields ?? {});
    const forces = named(kernels, part, "force", Object.keys(record.forces ?? {}));
    const counters = Object.fromEntries(state.counters.map((c) => [c.name, c.value]));
    globals.counters = counters;
    const emitters = Object.fromEntries(record.emitter.map((e) => [e.name, e]));

    /** A particle as the lambdas see it, from its state; `dead` turns true when a lambda calls kill(). */
    const handed = (q) => {
      const p = { pos: [q.x, q.y], vel: [q.vx, q.vy], age: q.age, life: q.life, size: q.size, dead: false };
      p.kill = () => { p.dead = true; };
      for (const f of fieldNames) p[f] = q.fields[f];
      return p;
    };
    const stored = (p, emitter) => ({ x: p.pos[0], y: p.pos[1], vx: p.vel[0], vy: p.vel[1], age: p.age, life: p.life, size: p.size, emitter, fields: Object.fromEntries(fieldNames.map((f) => [f, p[f]])) });

    const next = [];
    for (const q of state.particles) {
      const p = handed(q);
      p.age = q.age + dt;
      for (const f of emitters[q.emitter]?.opts.forces ?? []) forces[f]?.(p, dt);
      p.pos = [p.pos[0] + p.vel[0] * dt, p.pos[1] + p.vel[1] * dt];
      kernels.update?.(p, dt);
      if (!p.dead && p.age < p.life && inside(p.pos[0], p.pos[1], state.bounds)) next.push(stored(p, q.emitter));
    }

    const live = Object.fromEntries(record.emitter.map((e) => [e.name, next.filter((q) => q.emitter === e.name).length]));
    for (const e of record.emitter) {
      const at = [];
      if (e.opts.trigger) for (const ev of inputs[e.opts.trigger] ?? []) for (let i = 0; i < (e.opts.perEvent ?? PER_EVENT); i++) at.push(ev);
      const rate = Math.max(0, Math.min(kernels[`${e.name}.rate`](state.t, live[e.name]), e.opts.maxRate));
      for (let n = Math.floor(rate * dt + rng()); n > 0; n--) at.push({ at: [e.opts.x, e.opts.y] });
      at.forEach((ev, i) => {
        if (next.length >= state.maxParticles) return;
        const p = handed({ x: ev.at[0], y: ev.at[1], vx: 0, vy: 0, age: 0, life: 1, size: 1, fields: Object.fromEntries(fieldNames.map((f) => [f, record.fields[f].value])) });
        globals.ev = ev;
        kernels[`${e.name}.spawn`](p, rng, i);
        if (!p.dead) { next.push(stored(p, e.name)); live[e.name] += 1; }
      });
    }

    return {
      ...state, t: state.t + dt, particles: next,
      emitters: state.emitters.map((e) => ({ name: e.name, live: live[e.name] ?? 0 })),
      counters: state.counters.map((c) => ({ name: c.name, value: counters[c.name] })),
    };
  },
  events: { in: { burst: MAX_RECORDS } },
});
