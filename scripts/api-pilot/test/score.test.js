// The pilot's scorer: a hand-in's budget.dialect.js and budget.grammar.js against the hidden programs. An
// accept program passes when it checks with no error; a reject program passes when it gets at least one
// error in its own file. The reference passes every hidden program.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, cpSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { score } from "../score/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const REFERENCE = join(ROOT, "reference");
const CLI = join(ROOT, "score.js");

const GOOD = `import { budget } from "../budget.grammar.js";
export default ($) => budget("t").start(2026, 1).account("a", { opening: 0 }).inflow("pay", (m) => 1);
`;
const BAD = `// REJECT 1: f.nope
import { budget } from "../budget.grammar.js";
export default ($) => budget("t").start(2026, 1).account("a", { opening: 0 }).inflow("pay", (m, f) => f.nope);
`;

/** A hidden set holding the given programs. @param {Record<string, string>} accept @param {Record<string, string>} reject */
function hiddenSet(accept, reject) {
  const dir = mkdtempSync(join(tmpdir(), "api-pilot-hidden-"));
  mkdirSync(join(dir, "accept"));
  mkdirSync(join(dir, "reject"));
  for (const [f, t] of Object.entries(accept)) writeFileSync(join(dir, "accept", f), t);
  for (const [f, t] of Object.entries(reject)) writeFileSync(join(dir, "reject", f), t);
  return dir;
}

test("a valid program passes as accept and fails as reject; a faulty one the other way round", async () => {
  const hidden = hiddenSet({ "a1.js": GOOD, "a2.js": BAD }, { "r1.js": BAD, "r2.js": GOOD });
  try {
    const r = await score(REFERENCE, hidden);
    const by = Object.fromEntries(r.results.map((x) => [`${x.kind}/${x.file}`, x]));
    assert.equal(by["accept/a1.js"].pass, true);
    assert.equal(by["accept/a2.js"].pass, false);
    assert.deepEqual(by["accept/a2.js"].codes, ["L002"]);
    assert.equal(by["reject/r1.js"].pass, true);
    assert.deepEqual(by["reject/r1.js"].codes, ["L002"]);
    assert.equal(by["reject/r2.js"].pass, false);
    assert.deepEqual({ accept: r.accept, reject: r.reject }, { accept: { pass: 1, of: 2 }, reject: { pass: 1, of: 2 } });
  } finally { rmSync(hidden, { recursive: true, force: true }); }
});

test("an error in the definitions fails every program, and is reported once as a definition error", async () => {
  const handin = mkdtempSync(join(tmpdir(), "api-pilot-handin-"));
  const hidden = hiddenSet({ "a1.js": GOOD }, { "r1.js": BAD });
  try {
    cpSync(join(REFERENCE, "budget.dialect.js"), join(handin, "budget.dialect.js"));
    writeFileSync(join(handin, "budget.grammar.js"), "throw new Error('broken');\n");
    const r = await score(handin, hidden);
    assert.equal(r.definitions.ok, false);
    assert.ok(r.results.every((x) => !x.pass));
  } finally { rmSync(handin, { recursive: true, force: true }); rmSync(hidden, { recursive: true, force: true }); }
});

test("the reference passes every hidden program", async () => {
  const r = await score(REFERENCE, join(ROOT, "hidden"));
  const failed = r.results.filter((x) => !x.pass).map((x) => `${x.kind}/${x.file} ${x.codes.join(",")}`);
  assert.deepEqual(failed, []);
});

test("score.js prints one line per program and exits 0 only when every program passes", () => {
  const hidden = hiddenSet({ "a1.js": GOOD }, { "r1.js": GOOD });
  try {
    const r = spawnSync(process.execPath, [CLI, REFERENCE, hidden], { encoding: "utf8" });
    assert.equal(r.status, 1, r.stderr);
    assert.match(r.stdout, /accept\/a1\.js\s+pass/);
    assert.match(r.stdout, /reject\/r1\.js\s+FAIL/);
  } finally { rmSync(hidden, { recursive: true, force: true }); }
});

// Regressions from the review of 81a0eee: a run that scored nothing must not read as a pass.
test("score.js exits 2 when the hidden dir is missing or lacks accept/ or reject/", () => {
  const empty = mkdtempSync(join(tmpdir(), "api-pilot-hidden-"));
  try {
    for (const dir of [join(empty, "nope"), empty]) {
      const r = spawnSync(process.execPath, [CLI, REFERENCE, dir], { encoding: "utf8" });
      assert.equal(r.status, 2, `${dir}: ${r.stdout}${r.stderr}`);
      assert.match(r.stderr, /accept\/|reject\//);
    }
  } finally { rmSync(empty, { recursive: true, force: true }); }
});

test("score.js exits 1 when either kind has no programs", () => {
  const hidden = hiddenSet({ "a1.js": GOOD }, {});
  try {
    const r = spawnSync(process.execPath, [CLI, REFERENCE, hidden], { encoding: "utf8" });
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stderr, /no reject programs/);
  } finally { rmSync(hidden, { recursive: true, force: true }); }
});

