// Per-slot effects make the order the host runs instances in invisible (the Manuel consult's informed pass, §5 item 4):
// a lambda changes only the instance it is handed, and touches shared state only by bumping a total it never reads.
// So running an instance-space Kernel over every instance forward and in a seeded shuffle must leave every instance,
// every wilt request and every total identical (exactly, with whole-number bumps; fractional bumps may differ by
// rounding, which the target's compare mode decides). Checked here dynamically, through the interpreter and the JS
// backend, on the garden Dialect.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defineDialect } from "../index.js";
import { gardenDef } from "../fixtures/garden-dialect.js";
import { lowerLambda } from "../../lower/index.js";
import { run } from "../../interp/index.js";
import { emitKernel, instantiate } from "../../emit/js/emit.js";

const garden = defineDialect(/** @type {any} */ (gardenDef()));
const env = garden.environment({ total: { harvest: {}, wilted: {} }, param: { rate: {} } });
const GROW = `(pl, dt) => {
  pl.height = pl.height + pl.water * dt;
  pl.water = pl.water > dt ? pl.water - dt : 0;
  if (pl.height > 3) { totals.harvest += 2; pl.wilt(); }
  if (pl.water === 0) { totals.wilted++; pl.wilt(); }
  pl.spot = vec2(pl.spot.x, pl.spot.y + pl.height);
}`;

/** A seeded shuffle (mulberry32), so a failure reproduces. @param {number[]} xs @param {number} seed */
function shuffled(xs, seed) {
  let a = seed >>> 0;
  const rand = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

/** 40 plants, each a host object whose wilt() records a request, as a host would before removing it. */
function world() {
  /** @type {number[]} */
  const wilted = [];
  const plants = Array.from({ length: 40 }, (_, i) => ({
    id: i, height: (i % 7) * 0.6, water: (i % 5) * 0.25, age: i, spot: [i, 0],
    wilt() { wilted.push(this.id); },
  }));
  return { plants, wilted, totals: { harvest: 0, wilted: 0 } };
}

/** @param {ReturnType<typeof world>} w */
const snapshot = (w) => ({
  plants: w.plants.map(({ id, height, water, spot }) => ({ id, height, water, spot: [...spot] })),
  wilted: [...w.wilted].sort((a, b) => a - b),
  totals: { ...w.totals },
});

test("grow lowers clean against the garden's Environment", () => {
  const r = lowerLambda(env, GROW, { id: "grow#0", kind: "grow", on: "garden" });
  assert.deepEqual(r.diagnostics.filter((d) => d.severity === "error"), []);
});

for (const [backend, make] of /** @type {const} */ ([
  ["the interpreter", (/** @type {any} */ k) => (/** @type {unknown[]} */ ...args) => run(k, args, { globals: { totals: args[2] } })],
  ["the emitted JS", (/** @type {any} */ k) => { const f = /** @type {Function} */ (instantiate(emitKernel(k), {})); return (/** @type {unknown[]} */ ...args) => f(args[0], args[1]); }],
])) {
  test(`${backend}: three ticks forward and in three seeded shuffles leave one final state`, () => {
    const kernel = lowerLambda(env, GROW, { id: "grow#0", kind: "grow", on: "garden" }).kernel;
    assert.ok(kernel);
    const tick = make(kernel);
    /** @param {(ids: number[]) => number[]} order */
    const runAll = (order) => {
      const w = world();
      // the emitted function reads `totals` as a free name, as the host's scope provides it
      /** @type {any} */ (globalThis).totals = w.totals;
      try {
        for (let t = 0; t < 3; t++) for (const i of order(w.plants.map((p) => p.id))) tick(w.plants[i], 0.5, w.totals);
      } finally { delete (/** @type {any} */ (globalThis)).totals; }
      return snapshot(w);
    };
    const forward = runAll((ids) => ids);
    assert.ok(forward.totals.harvest > 0 && forward.totals.wilted > 0 && forward.wilted.length > 0, "the run exercises bumps and verbs");
    for (const seed of [1, 7, 42]) assert.deepEqual(runAll((ids) => shuffled(ids, seed)), forward, `seed ${seed}`);
  });
}

test("the check has teeth: a lambda that reads a total it bumps (refused by L017, lowered here with may lifted) differs by order", () => {
  /** @type {any} */
  const open = { ...env, slot: (/** @type {any} */ r) => ({ .../** @type {any} */ (env.slot(r)), may: undefined }) };
  const r = lowerLambda(open, "(pl, dt) => { totals.harvest += 1; pl.height = totals.harvest; }", { id: "grow#0", kind: "grow", on: "garden" });
  assert.ok(r.kernel, JSON.stringify(r.diagnostics));
  /** @param {(ids: number[]) => number[]} order */
  const runAll = (order) => {
    const w = world();
    for (const i of order(w.plants.map((p) => p.id))) run(/** @type {any} */ (r.kernel), [w.plants[i], 0.5], { globals: { totals: w.totals } });
    return snapshot(w);
  };
  assert.notDeepEqual(runAll((ids) => shuffled(ids, 7)), runAll((ids) => ids));
});
