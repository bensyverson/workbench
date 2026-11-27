// The tests dogfood's tools (leaf mxxKTa), on the real kit since leaf ceE4ib: the recorded hand-ins' own manifest tests
// pass, each broken runtime (a mutant) is caught by at least one of the author's own tests, and the trial's checker adds
// its two codes for tests.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { hashDir } from "../../../pkg/dir.js";
import { checkAuthor } from "../../checker/legs.js";
import { mutate } from "../mutate.js";

const leg = (/** @type {string} */ p) => fileURLToPath(new URL(`../../runs/2026-11-27-tests/${p}`, import.meta.url));
const LEGS = /** @type {const} */ ([["score-1/tally", "score"], ["score-2/tally", "score"], ["game-3/gemmaze", "game"]]);

test("the recorded dogfood hand-ins pass the M4 author check, and their own tests (at least three each) pass on the real kit", async () => {
  for (const [dir, role] of LEGS) {
    const r = await checkAuthor(leg(dir), role);
    assert.deepEqual(r.diagnostics.filter((d) => d.severity === "error"), [], dir);
    assert.ok((r.tests?.run ?? 0) >= 3 && r.tests?.passed === r.tests?.run, `${dir}: ${JSON.stringify(r.tests)}`);
  }
});

/** The mutants the dogfood findings record: [leg, runtime file, old text, new text, a test that kills it]. */
const MUTANTS = [
  ["score-1/tally", "tally.runtime.js", "rec.$T < end - EPS && ", "", "end-freezes-score"],
  ["score-2/tally", "tally.runtime.js", "if (event.$T < end) ", "", "end-freezes-score"],
];

test("a broken runtime is caught by the author's own tests: a score counted after the end", async () => {
  for (const [dir, file, from, to, killer] of MUTANTS) {
    const r = await mutate(leg(dir), file, from, to);
    assert.ok(r.killed, `${dir} survived`);
    assert.ok(r.diagnostics.some((d) => d.code === "H006" && d.message.includes(killer)), `${dir}: ${r.diagnostics.map((d) => d.message).join("\n")}`);
  }
});

test("a mutant that changes nothing the tests read survives, and a text the file lacks is refused", async () => {
  const same = await mutate(leg("score-1/tally"), "tally.runtime.js", "rec.$T < end - EPS && ", "rec.$T < end - EPS && true && ");
  assert.equal(same.killed, false);
  await assert.rejects(mutate(leg("score-1/tally"), "tally.runtime.js", "no such text anywhere", "x"), /exactly once/);
});

const CHECK = fileURLToPath(new URL("../check.js", import.meta.url));

test("a manifest that lists tests is not T030 when its tests never ran because the package did not load (a blind leg read 'the manifest has no tests' beside a K011)", async () => {
  const d = join(mkdtempSync(join(tmpdir(), "aWrZQr-")), "gemmaze");
  cpSync(leg("game-3/gemmaze"), d, { recursive: true });
  writeFileSync(join(d, "gemmaze.dialect.js"), readFileSync(join(d, "gemmaze.dialect.js"), "utf8") + "\nthrow new Error('broken');\n");
  await hashDir(d);
  const r = spawnSync(process.execPath, [CHECK, "--role", "game", d], { encoding: "utf8" });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /K011 /);
  assert.doesNotMatch(r.stdout, /T030 /);
  // a manifest with no tests is still T030
  const m = JSON.parse(readFileSync(join(d, "wb-package.json"), "utf8"));
  delete m.tests;
  writeFileSync(join(d, "wb-package.json"), JSON.stringify(m, null, 2));
  const n = spawnSync(process.execPath, [CHECK, "--role", "game", d], { encoding: "utf8" });
  assert.match(n.stdout, /T030 /);
});
