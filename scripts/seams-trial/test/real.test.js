// The acceptance test of the seams build (leaf CelvhJ): the nine recorded relay hand-ins check clean on the real
// kit/define and kit/compose, after only the massage the 2026-11-26 rulings force, which is listed per run.

import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { checkRunReal, checkComposeReal, massage, RUNS } from "../real.js";
import { handIn, remove } from "../fixture-copy.js";
import { hashDir } from "../../pkg/dir.js";

test("the nine relay hand-ins are the recorded ones", () => {
  assert.deepEqual(RUNS.map((r) => r.leg), ["r1-maze", "r1-particles", "r1-compose", "r2-maze", "r2-particles", "r2-compose", "r3-maze", "r3-particles", "r3-compose"]);
});

for (const run of RUNS) {
  test(`${run.leg} checks clean on the real kit after the forced massage`, async () => {
    const r = await checkRunReal(run);
    assert.deepEqual(r.diagnostics.map((d) => `${d.file}:${d.line}: ${d.code} ${d.message}`), []);
    assert.deepEqual(r.massage, run.massage, "the massage is the recorded one");
    if (run.role === "compose") assert.ok(r.plan.length > 0 && r.plan.every((p) => p.includes("→")), r.plan.join("\n"));
  });
}

test("the trial's valid composition, its Event from removed, checks clean on kit/compose with the plan ×32 +[16, 48]", async () => {
  const dir = await handIn("compose", (d) => { massage(d); });
  try {
    for (const p of ["maze", "particles"]) await hashDir(join(dir, p));
    const r = await checkComposeReal(dir);
    assert.deepEqual(r.diagnostics, []);
    assert.deepEqual(r.plan, ["level.out.picked → fx.in.burst: at: maze.cell → particles.px, point, ×32 +[16, 48] (fit at line 41: [-0.5, -0.5]..[9.5, 7.5] in [0, 0]..[320, 320])"]);
  } finally { remove(dir); }
});
