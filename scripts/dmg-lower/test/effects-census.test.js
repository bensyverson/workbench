// The effects census (review of 4836a83, job UypdwY): its per-verb and per-place counts are lambdas, as its
// labels say, and the entries that do not lower are counted and printed, not skipped silently.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDmg } from "../../dmg-oracle/load.js";
import { census } from "../effects-census.js";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "..", "effects-census.js");

test("every verb and world place is counted once per lambda that carries it", () => {
  const c = census(loadDmg());
  for (const [verb, n] of Object.entries(c.verbs)) assert.ok(n <= c.lambdas, `${verb}: ${n} > ${c.lambdas} lambdas`);
  for (const [place, n] of Object.entries(c.worldPlaces)) assert.ok(n <= c.classes.world, `${place}: ${n} > ${c.classes.world}`);
  const { world, entity, other, pure } = c.classes;
  assert.equal(world + entity + other + pure, c.lambdas);
});

test("the entries that do not lower are counted, and lowered plus skipped is every entry", () => {
  const c = census(loadDmg());
  assert.ok(c.skipped > 0);
  assert.equal(c.lambdas + c.skipped, c.entries);
});

test("the command prints how many entries it skipped", () => {
  const r = spawnSync(process.execPath, [SCRIPT], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /skipped \(did not lower\): \d+ of \d+ entries/);
});
