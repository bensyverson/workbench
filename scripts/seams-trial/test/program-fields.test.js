// The particles fixture keeps each .field in the run's state (leaf 62J2dk, Ben's ruling 2 of 2026-11-26): its
// Dialect marks a particle's `fields` struct extensible and environment(program) adds one f64 per .field, so a value
// the update lambda changes lasts from tick to tick, by name, instead of riding in a capped list.

import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { loadPackageDir } from "../checker/load.js";
import { buildOptions } from "../../pkg-trial/checker/scope.js";
import { FIXTURES_2 } from "../fixture-copy.js";
import { compose } from "../../../kit/compose/index.js";
import { createRun } from "../../../kit/run/index.js";

test("the fountain's heat field cools tick by tick in each particle's state, and the run's checks hold", async () => {
  const pkg = await loadPackageDir(join(FIXTURES_2, "particles"));
  assert.deepEqual(pkg.diagnostics, []);
  const { runtime } = pkg.loaded;
  const mod = await pkg.importModule("examples/01.js");
  const build = buildOptions("examples/01.js", mod);
  const fountain = mod.default({ rate: 60, wind: 0 });
  assert.deepEqual(runtime.dialect.stateFields(fountain.build(build)), { heat: "f64" });
  const composed = compose("solo").part(fountain).build({ runtimes: [runtime], build });
  const run = createRun(composed, { runtimes: [runtime] });
  run.runUntil(0.5);
  assert.deepEqual(run.diagnostics, []);
  const heats = run.state("fountain").particles.map((/** @type {any} */ p) => p.fields.heat);
  assert.ok(heats.length > 0);
  assert.ok(heats.some((/** @type {number} */ h) => h < 0.9), `some particle has cooled: ${heats.slice(0, 5)}`);
  assert.ok(heats.every((/** @type {number} */ h) => h > 0 && h <= 1));
});
