// The tests dogfood's tools (leaf mxxKTa), on the real kit since leaf ceE4ib: the recorded hand-ins' own manifest tests
// pass, each broken runtime (a mutant) is caught by at least one of the author's own tests, and the trial's checker adds
// its two codes for tests.

import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
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
