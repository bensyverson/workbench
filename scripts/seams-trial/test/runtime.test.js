// The acceptance test of the runtime build (leaf ZH4KWX): the relay's maze and particles packages, given runtime
// modules, composed by the trial's glue and run headless on kit/run with a scripted D-pad. A coin picked up at
// T = 19/8 bursts at the particles part's first step at or after it, T = 2.4 (the clocks draft's worked answer),
// and replaying the run's log gives identical state hashes.

import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { loadComposeReal, massage } from "../real.js";
import { handIn, remove } from "../fixture-copy.js";
import { hashDir } from "../../pkg/dir.js";
import { createRun, replay } from "../../../kit/run/index.js";

/** The D-pad held right from T on (nothing else pressed). @param {number} T */
const right = (T) => ({ kind: "in", T, part: "level", name: "pad", value: { up: false, down: false, left: false, right: true } });

/** The trial's composition, its Event from removed, loaded with its packages' runtimes. */
async function workbench() {
  const dir = await handIn("compose", (d) => { massage(d); });
  try {
    for (const p of ["maze", "particles"]) await hashDir(join(dir, p));
    const r = await loadComposeReal(dir);
    assert.deepEqual(r.diagnostics, []);
    const runtimes = r.loaded.map((p) => p.runtime);
    assert.equal(runtimes.length, 2);
    assert.ok(runtimes.every((x) => x), "each package names its runtime");
    const composed = r.composition.build({ ...r.options, runtimes });
    const packages = r.loaded.map((p) => ({ name: p.name, content: p.content }));
    return { composed, runtimes, packages };
  } finally { remove(dir); }
}

test("the composed coin-bursts workbench runs headless: a pickup at T = 19/8 bursts at T = 2.4, at the coin's pixel", async () => {
  const { composed, runtimes, packages } = await workbench();
  // the player stands at (1, 1); the D-pad goes right at 18/8, so the maze's step at 19/8 enters the coin at (3, 1)
  const run = createRun(composed, { runtimes, packages, inputs: [right(18 / 8)] });
  /** @type {Array<{ T: string, live: number }>} */
  const fx = [];
  while (run.seconds < 3) {
    const i = /** @type {any} */ (run.step());
    if (i.T === "19/8") assert.deepEqual(run.state("level").player, { x: 3, y: 1 });
    if (i.stepped.includes("fx")) fx.push({ T: i.T, live: run.state("fx").particles.length });
  }
  assert.deepEqual(run.diagnostics, []);
  const before = fx.filter((f) => f.T !== "12/5" && Number(f.T.split("/")[0]) / Number(f.T.split("/")[1] ?? 1) < 2.4);
  assert.ok(before.every((f) => f.live === 0), "nothing bursts before 2.4");
  assert.deepEqual(fx.find((f) => f.T === "12/5"), { T: "12/5", live: 24 });
  // the burst is the pop emitter's whole maxRate, placed at the coin's cell converted to pixels: ×32 +[16, 48]
  const born = run.state("fx").particles.filter((/** @type {any} */ p) => p.age < 0.6);
  assert.ok(born.length >= 24);
  // the next coin, (7, 1), is entered at 23/8 = 2.875: its burst is at fx's step at 87/30 = 2.9
  assert.equal(run.state("level").score, 2);
  const at = fx.find((f) => f.T === "29/10");
  assert.ok(at && at.live > 24, JSON.stringify(fx.slice(-5)));
});

test("the burst's particles start at the coin's pixel, (112, 80)", async () => {
  const { composed, runtimes, packages } = await workbench();
  const run = createRun(composed, { runtimes, packages, inputs: [right(18 / 8)] });
  run.runUntil(2.4);
  const ps = run.state("fx").particles;
  assert.equal(ps.length, 24);
  for (const p of ps) assert.deepEqual([p.x, p.y, p.age], [112, 80, 0]);
});

test("replaying the run's log gives identical state hashes at every instant", async () => {
  const { composed, runtimes, packages } = await workbench();
  const run = createRun(composed, { runtimes, packages, seed: 11, inputs: [right(18 / 8), { ...right(2.9), value: { up: false, down: true, left: false, right: false } }] });
  run.runUntil(3.5);
  const record = run.record();
  assert.ok(record.hashes.length > 100);
  const r = replay(composed, { runtimes, packages }, JSON.parse(JSON.stringify(record)));
  assert.deepEqual(r.diagnostics, []);
  assert.deepEqual(r.run.hashes, record.hashes);
});
