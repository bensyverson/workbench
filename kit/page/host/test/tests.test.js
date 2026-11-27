// The host's Tests row (leaf ceE4ib): a package's manifest tests run from what the host loaded (`runLoadedTests`), and a
// failed test opens as a preset (`wirePage: false`, the test's log as the run's inputs) paused at the failing instant.
// A package with no tests has no row. The maze is the draw trial's massaged hand-in, given tests here.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { readPackageDir, hashDir } from "../../../../scripts/pkg/dir.js";
import { fakeContext, frames } from "../../fixtures/bench.js";
import { loadPackagesOnly, loadPreset, runLoadedTests, packagesWithTests } from "../load.js";
import { createSession } from "../session.js";

const MAZE = fileURLToPath(new URL("../../../../scripts/draw-trial/massaged/2026-11-26-compose/maze", import.meta.url));
const kit = (/** @type {string} */ p) => new URL(`../../../${p}`, import.meta.url).href;
/** @type {import("../load.js").LoadEnv} */
const env = {
  urls: { define: kit("define/index.js"), compose: kit("compose/index.js") },
  makeUrl: (text) => `data:text/javascript;base64,${Buffer.from(text).toString("base64")}`,
  importUrl: (url) => import(url),
};
const RIGHT = { up: false, down: false, left: false, right: true };
const WALK = { name: "pad-walks-right", example: "examples/01.js", inputs: [{ T: 0.5, in: "pad", value: RIGHT }], expect: [{ at: 0.25, state: { "player.x": 1 } }, { at: 1, state: { "player.x": 6 } }] };

/** The maze package's files with these tests (none: the package as it is), hashed. @param {any[] | null} tests */
async function files(tests) {
  const dir = mkdtempSync(join(tmpdir(), "ceE4ib-host-"));
  try {
    cpSync(MAZE, dir, { recursive: true });
    if (tests) {
      const path = join(dir, "wb-package.json");
      writeFileSync(path, JSON.stringify({ ...JSON.parse(readFileSync(path, "utf8")), tests }, null, 2));
      await hashDir(dir);
    }
    return readPackageDir(dir);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test("a package with no tests has no Tests row, and running them is clean", async () => {
  const loaded = await loadPackagesOnly({ maze: await files(null) }, env);
  assert.deepEqual(packagesWithTests(loaded), []);
  assert.deepEqual(await runLoadedTests(loaded, env), []);
});

test("a package with tests is listed, and its tests run from what the host loaded: pass and fail, by package", async () => {
  const bad = { ...WALK, name: "wrong", expect: [{ at: 1, state: { "player.x": 9 } }] };
  const loaded = await loadPackagesOnly({ maze: await files([WALK, bad]) }, env);
  assert.deepEqual(packagesWithTests(loaded).map((p) => [p.name, p.tests.map((t) => t.name)]), [["maze", ["pad-walks-right", "wrong"]]]);
  const r = await runLoadedTests(loaded, env);
  assert.deepEqual(r.map((x) => x.package), ["maze"]);
  assert.deepEqual(r[0].results.map((x) => [x.name, x.ok]), [["pad-walks-right", true], ["wrong", false]]);
  assert.deepEqual(r[0].diagnostics.map((d) => d.code), ["H006"]);
});

test("a failed test opens as a preset with its log, paused at the failing instant, the state the test read", async () => {
  const bad = { ...WALK, name: "wrong", expect: [{ at: 1, state: { "player.x": 9 } }] };
  const packages = { maze: await files([bad]) };
  const loaded = await loadPackagesOnly(packages, env);
  const [r] = await runLoadedTests(loaded, env);
  const failed = r.diagnostics[0];
  assert.equal(failed.at, 1);
  const result = r.results[0];
  const w = await loadPreset({ packages, package: "maze", example: "examples/01.js", wirePage: false }, env);
  assert.deepEqual(w.diagnostics.filter((d) => d.severity === "error"), []);
  const f = frames();
  const s = createSession(w, { context: fakeContext(), requestFrame: f.requestFrame, run: { inputs: result.log.inputs, seed: result.log.header.seed } });
  s.seek(failed.at);
  assert.equal(s.page.driver.paused, true);
  assert.equal(s.page.run.seconds, 1);
  assert.equal(s.page.run.state(s.snapshot().parts[0].part).player.x, 6);
  assert.ok(s.page.run.log.inputs.some((/** @type {any} */ i) => i.kind === "in" && i.name === "pad"));
});

test("a preset loaded with the page wired (the default) refuses a test's in input, which is why Open does not wire it", async () => {
  const packages = { maze: await files(null) };
  const w = await loadPreset({ packages, package: "maze", example: "examples/01.js" }, env);
  const s = createSession(w, { context: fakeContext(), requestFrame: frames().requestFrame });
  assert.throws(() => s.page.run.input({ kind: "in", T: 1, part: s.snapshot().parts[0].part, name: "pad", value: RIGHT }), /N011/);
});
