// The folder checker runs a package's manifest tests after its examples (leaf ceE4ib): a package with passing tests is
// clean and counted, a failing one is H006 at the test, a test naming a missing input is K020 and nothing runs, and a
// package with no tests is clean (tests are optional, Ben's ruling 2).
import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkPackageDir } from "../checker/index.js";
import { hashDir } from "../../pkg/dir.js";

const MAZE = fileURLToPath(new URL("../../draw-trial/massaged/2026-11-26-compose/maze", import.meta.url));
const RIGHT = { up: false, down: false, left: false, right: true };
const WALK = { name: "pad-walks-right", example: "examples/01.js", inputs: [{ T: 0.5, in: "pad", value: RIGHT }], expect: [{ at: 0.25, state: { "player.x": 1 } }, { at: 1, state: { "player.x": 6 } }] };

/** The maze package with these tests in its manifest, checked. @param {any[] | null} tests */
async function check(tests) {
  const dir = mkdtempSync(join(tmpdir(), "ceE4ib-"));
  try {
    cpSync(MAZE, dir, { recursive: true });
    const path = join(dir, "wb-package.json");
    const manifest = JSON.parse(readFileSync(path, "utf8"));
    if (tests) manifest.tests = tests;
    writeFileSync(path, JSON.stringify(manifest, null, 2));
    await hashDir(dir);
    return await checkPackageDir(dir);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test("a package with no tests is clean, and its record counts none", async () => {
  const r = await check(null);
  assert.deepEqual(r.diagnostics, []);
  assert.deepEqual(r.tests, { run: 0, passed: 0 });
});

test("a package whose tests pass is clean, and its record counts them", async () => {
  const r = await check([WALK]);
  assert.deepEqual(r.diagnostics, []);
  assert.deepEqual(r.tests, { run: 1, passed: 1 });
});

test("a failing test is H006, naming the test, in the manifest, and is counted as run and not passed", async () => {
  const r = await check([{ ...WALK, expect: [{ at: 1, state: { "player.x": 7 } }] }]);
  assert.deepEqual(r.diagnostics.map((d) => d.code), ["H006"]);
  assert.match(r.diagnostics[0].message, /pad-walks-right/);
  assert.equal(r.diagnostics[0].file, "wb-package.json");
  assert.deepEqual(r.tests, { run: 1, passed: 0 });
});

test("a test naming an input the Dialect lacks is K020, and no test runs", async () => {
  const r = await check([WALK, { ...WALK, name: "other", inputs: [{ T: 1, in: "dpad", value: RIGHT }] }]);
  assert.deepEqual(r.diagnostics.map((d) => d.code), ["K020"]);
  assert.deepEqual(r.tests, { run: 0, passed: 0 });
});
