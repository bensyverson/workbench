// The runtime contract's rulings 1, 3 and 6 (Ben, 2026-11-26; project/2026-11-26-runtime-contract-plan.md): a named
// call's Kernel by "<instance>.<slot>.<name>" beside its positional id, a read-only $T on every delivered Event
// record (its producer's instant), and a record global that reads as null in a listed slot called without a record.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRun, replay } from "../index.js";
import { compose } from "../../compose/index.js";
import { name, lambda } from "../../define/index.js";
import { tiny, pair, fxKit, bursts } from "./helpers.js";

/** A part with a repeated named slot (`force`) and an unnamed one (`k`); init hands its kernels to `seen`. */
function named(/** @type {(kernels: any) => void} */ seen, /** @type {(g: any) => any} */ program) {
  const t = tiny("nk", { state: { k: "f64" }, inputs: false, ports: { out: {}, in: {} }, slots: { force: { kind: "decl", args: [name("force"), lambda("k")] } } },
    { clock: () => ({ tick: 1 }), init: (/** @type {any} */ _r, /** @type {any} */ c) => { seen(c.kernels); return { k: 0 }; }, step: (/** @type {any} */ s) => s });
  const part = program(t.grammar("p"));
  const composed = compose("n").part(part).build({ runtimes: [t.runtime] });
  return createRun(composed, { runtimes: [t.runtime] });
}

test("a named call's Kernel is ctx.kernels[<instance>.<slot>.<name>], the same function as its positional id", () => {
  /** @type {any} */
  let k = null;
  named((x) => { k = x; }, (g) => g.force("gravity", "() => 1").force("drag", "() => 2").k("() => 3"));
  const ids = Object.keys(k);
  const gravity = ids.find((id) => id.startsWith("p.force#") && k[id]() === 1);
  const drag = ids.find((id) => id.startsWith("p.force#") && k[id]() === 2);
  assert.ok(gravity && drag, `positional ids stay the keys: ${ids.join(", ")}`);
  assert.equal(k["p.force.gravity"], k[gravity]);
  assert.equal(k["p.force.drag"], k[drag]);
  assert.ok(!ids.includes("p.force.gravity"), "the name is an alias, not enumerable: Object.keys lists the ids");
  const unnamed = ids.find((id) => id.startsWith("p.k#"));
  assert.ok(unnamed, "the unnamed call keeps its positional id");
  assert.deepEqual(Object.getOwnPropertyNames(k).filter((n) => n.startsWith("p.k.")), [], "an unnamed call has only its positional id");
});

/** A pair whose consumer keeps each record's $T, and whether writing it threw. */
function stamped() {
  return pair({
    prodClock: { tick: 1 / 4 }, consClock: { tick: 1 / 2 },
    consStep: (/** @type {any} */ s, /** @type {any} */ c) => {
      const Ts = c.inputs.e.map((/** @type {any} */ r) => r.$T);
      let refused = 0;
      for (const r of c.inputs.e) { try { r.$T = 99; } catch { refused++; } }
      const keys = c.inputs.e.flatMap((/** @type {any} */ r) => Object.keys(r));
      return { got: [...s.got, refused, keys.includes("$T") ? 1 : 0], Ts: [...s.Ts, ...Ts], biggest: Math.max(s.biggest, c.inputs.e.length) };
    },
  });
}

test("a delivered Event record carries $T, its producer's instant in seconds; writing it throws", () => {
  const { composed, runtimes } = stamped();
  const run = createRun(composed, { runtimes });
  run.runUntil(1);
  assert.deepEqual(run.diagnostics, []);
  // the consumer steps at 0, 1/2 and 1, taking what the producer pushed at 0; 1/4 and 1/2; 3/4 and 1
  assert.deepEqual(run.state("b").Ts, [0, 0.25, 0.5, 0.75, 1]);
  const got = /** @type {number[]} */ (run.state("b").got);
  assert.deepEqual(got.filter((_, i) => i % 2 === 0), [1, 2, 2], "every write of $T threw");
  assert.deepEqual(got.filter((_, i) => i % 2 === 1), [0, 0, 0], "$T is not enumerable: a record's keys are its fields");
});

test("a run that reads $T replays clean", () => {
  const { composed, runtimes } = stamped();
  const run = createRun(composed, { runtimes });
  run.runUntil(2);
  assert.equal(run.state("b").Ts.length, 9, "the state holds every $T it read");
  assert.equal(replay(composed, { runtimes }, run.record()).ok, true);
});

test("a delayed wire's records carry the producer's instant, not the consumer's", () => {
  const { composed, runtimes } = pair({ prodClock: { tick: 1 / 4 }, consClock: { tick: 1 / 4 }, wire: { delay: true },
    consStep: (/** @type {any} */ s, /** @type {any} */ c) => ({ got: s.got, Ts: [...s.Ts, ...c.inputs.e.map((/** @type {any} */ r) => r.$T)], biggest: 0 }) });
  const run = createRun(composed, { runtimes });
  run.runUntil(0.5);
  assert.deepEqual(run.state("b").Ts, [0, 0.25]);
});

const GUARDED = "(p, rng) => { if (ev != null) { p.pos = ev.at; p.life = 1; } else { p.life = 7; } }";

test("a listed record slot called without a record reads its record global as null", () => {
  const F = fxKit({
    step: (/** @type {any} */ s, /** @type {any} */ ctx) => {
      const seen = [...s.seen];
      // a spawn by rate: no record set this step
      const p = { pos: [0, 0], vel: [0, 0], life: 0 };
      ctx.kernels["pop.spawn"](p, ctx.rng, ctx.dt);
      seen.push({ T: ctx.T, x: p.pos[0], y: p.pos[1], rev: p.life });
      for (const ev of ctx.inputs.burst) {
        const q = { pos: [0, 0], vel: [0, 0], life: 0 };
        ctx.globals.ev = ev;
        ctx.kernels["pop.spawn"](q, ctx.rng, ctx.dt);
        ctx.globals.ev = null;
        seen.push({ T: ctx.T, x: q.pos[0], y: q.pos[1], rev: q.life });
      }
      return { ...s, seen };
    },
  });
  const f = /** @type {any} */ (F.grammar("fx").bounds({ width: 320, height: 320 }).emitter("pop", { x: 160, y: 160, trigger: "burst" }).rate("(t, live) => 0").spawn(GUARDED));
  const composed = compose("alone").part(f).build({ runtimes: [F.runtime] });
  const run = createRun(composed, { runtimes: [F.runtime] });
  run.runUntil(0);
  assert.deepEqual(run.diagnostics, []);
  assert.deepEqual(run.state("fx").seen.map((/** @type {any} */ x) => x.rev), [7], "the guard's else branch ran: ev was null");
});

test("a record global set by the runtime reads as the record: the guarded lambda takes its fields", () => {
  const { composed, runtimes } = bursts({ fx: fxKit() });
  const run = createRun(composed, { runtimes, inputs: [{ kind: "control", T: 0, part: "level", name: "pad", value: { up: false, down: false, left: false, right: true } }] });
  run.runUntil(1);
  assert.deepEqual(run.diagnostics, []);
  assert.ok(run.state("fx").seen.length >= 1, "the burst spawned through the guarded lambda");
});

test("a lambda that reads its record global without a null check is refused at lowering: L008, its tip naming the check", () => {
  const F = fxKit();
  const f = /** @type {any} */ (F.grammar("fx").bounds({ width: 320, height: 320 }).emitter("pop", { x: 160, y: 160, trigger: "burst" }).rate("(t, live) => 0").spawn("(p, rng) => { p.pos = ev.at; }"));
  const ds = compose("alone").part(f).check({ runtimes: [F.runtime] });
  assert.deepEqual(ds.map((d) => d.code), ["L008"]);
  assert.match(ds[0].message, /'ev' may be empty/);
  assert.match(ds[0].fix, /ev == null/);
});

test("a null check on a record global narrows it through && and an early return too", () => {
  const F = fxKit();
  for (const src of ["(p, rng) => { if (ev == null) return; p.pos = ev.at; }", "(p, rng) => { p.life = ev != null && ev.at.x > 0 ? 1 : 0; }"]) {
    const f = /** @type {any} */ (F.grammar("fx").bounds({ width: 320, height: 320 }).emitter("pop", { x: 160, y: 160, trigger: "burst" }).rate("(t, live) => 0").spawn(src));
    assert.deepEqual(compose("alone").part(f).check({ runtimes: [F.runtime] }), [], src);
  }
});
