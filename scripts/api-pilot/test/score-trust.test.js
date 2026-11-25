// Regressions from the 2026-11-25 review of the scorer (job Mv42ME): a refusal for the wrong reason must not
// count as a reject, one program's crash must not fail the others, the worker's result is checked rather than
// believed, an unusable --timeout is refused, and a worker that leaves no result shows its stderr.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, cpSync, writeFileSync, readFileSync, rmSync } from "node:fs";
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
const BAD = `// REJECT 1: f.nope (expect: L002)
import { budget } from "../budget.grammar.js";
export default ($) => budget("t").start(2026, 1).account("a", { opening: 0 }).inflow("pay", (m, f) => f.nope);
`;
/** A program whose flow is named "boom", which the BOOM hand-in's check throws on. @param {string} head */
const boom = (head = "") => `${head}import { budget } from "../budget.grammar.js";
export default ($) => budget("t").start(2026, 1).account("a", { opening: 0 }).inflow("boom", (m) => 1);
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

/** A hand-in: the reference's definitions with its grammar's text passed through `edit`. @param {(text: string) => string} edit */
function handin(edit) {
  const dir = mkdtempSync(join(tmpdir(), "api-pilot-handin-"));
  cpSync(join(REFERENCE, "budget.dialect.js"), join(dir, "budget.dialect.js"));
  const g = join(dir, "budget.grammar.js");
  writeFileSync(g, edit(readFileSync(join(REFERENCE, "budget.grammar.js"), "utf8")));
  return dir;
}
/** @param {...string} dirs */
const clean = (...dirs) => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); };

test("a reject program refused because the candidate's grammar did not load (C001) fails, and the CLI exits 1", async () => {
  const misnamed = handin((t) => t.replace("export const budget =", "export const program ="));
  const hidden = hiddenSet({ "a1.js": GOOD }, { "r1.js": BAD });
  try {
    const r = await score(misnamed, hidden);
    const r1 = r.results.find((x) => x.file === "r1.js");
    assert.deepEqual(r1?.codes, ["C001"]);
    assert.equal(r1?.pass, false);
    assert.deepEqual(r.reject, { pass: 0, of: 1 });
    const cli = spawnSync(process.execPath, [CLI, misnamed, hidden], { encoding: "utf8" });
    assert.equal(cli.status, 1, cli.stdout + cli.stderr);
    assert.match(cli.stdout, /reject 0\/1/);
  } finally { clean(misnamed, hidden); }
});

test("a crash in the candidate's check reached by one program fails that program only", async () => {
  const BOOM = handin((t) => t.replace("function checkFlowName({ args: [n] }, ctx) {", "function checkFlowName({ args: [n] }, ctx) {\n  if (n === \"boom\") throw new Error(\"boom\");"));
  const hidden = hiddenSet({ "a1.js": GOOD, "a2.js": boom() }, { "r1.js": BAD, "r2.js": boom("// REJECT 2: crashes (expect: U003)\n") });
  try {
    const r = await score(BOOM, hidden);
    assert.equal(r.definitions.ok, true, r.definitions.codes.join(","));
    const by = Object.fromEntries(r.results.map((x) => [`${x.kind}/${x.file}`, x]));
    assert.equal(by["accept/a1.js"].pass, true);
    assert.equal(by["reject/r1.js"].pass, true);
    assert.deepEqual(by["accept/a2.js"].codes, ["C005"]);
    assert.equal(by["accept/a2.js"].pass, false);
    // a crash is not a refusal
    assert.deepEqual(by["reject/r2.js"].codes, ["C005"]);
    assert.equal(by["reject/r2.js"].pass, false);
  } finally { clean(BOOM, hidden); }
});

test("a throw while the definitions load still fails every program", async () => {
  const broken = handin((t) => `${t}\nthrow new Error("broken at load");\n`);
  const hidden = hiddenSet({ "a1.js": GOOD }, { "r1.js": BAD });
  try {
    const r = await score(broken, hidden);
    assert.equal(r.definitions.ok, false);
    assert.ok(r.results.every((x) => !x.pass));
  } finally { clean(broken, hidden); }
});

/** A grammar suffix that writes `result` to the worker's result file and exits 0. @param {unknown} result */
const forger = (result) => `
import { writeFileSync as __w } from "node:fs";
__w(process.argv[4], ${JSON.stringify(JSON.stringify(result))});
process.exit(0);
`;

test("a forged result that does not list exactly the hidden programs is not believed", async () => {
  const forged = handin((t) => t + forger({
    definitions: { ok: true, codes: [] },
    results: [{ kind: "accept", file: "a01.js", pass: true, codes: [], expected: [] }, { kind: "reject", file: "r01a.js", pass: true, codes: ["L002"], expected: ["L002"] }],
    accept: { pass: 1, of: 1 }, reject: { pass: 1, of: 1 }, warnings: [],
  }));
  const hidden = hiddenSet({ "a1.js": GOOD }, { "r1.js": BAD });
  try {
    const r = await score(forged, hidden);
    assert.equal(r.definitions.ok, false);
    assert.deepEqual(r.results.map((x) => `${x.kind}/${x.file}`), ["accept/a1.js", "reject/r1.js"]);
    assert.ok(r.results.every((x) => !x.pass));
    assert.deepEqual({ accept: r.accept, reject: r.reject }, { accept: { pass: 0, of: 1 }, reject: { pass: 0, of: 1 } });
    const cli = spawnSync(process.execPath, [CLI, forged, hidden], { encoding: "utf8" });
    assert.equal(cli.status, 1, cli.stdout + cli.stderr);
  } finally { clean(forged, hidden); }
});

test("pass and the tallies are recomputed from each program's codes, not taken from the worker", async () => {
  // the right programs, but every verdict and tally a lie
  const forged = handin((t) => t + forger({
    definitions: { ok: true, codes: [] },
    results: [
      { kind: "accept", file: "a1.js", pass: true, codes: ["L002"], expected: [] },
      { kind: "reject", file: "r1.js", pass: true, codes: [], expected: [] },
      { kind: "reject", file: "r2.js", pass: true, codes: ["C001"], expected: [] },
    ],
    accept: { pass: 1, of: 1 }, reject: { pass: 2, of: 2 }, warnings: [],
  }));
  const hidden = hiddenSet({ "a1.js": GOOD }, { "r1.js": BAD, "r2.js": BAD });
  try {
    const r = await score(forged, hidden);
    assert.ok(r.results.every((x) => !x.pass));
    assert.deepEqual({ accept: r.accept, reject: r.reject }, { accept: { pass: 0, of: 1 }, reject: { pass: 0, of: 2 } });
    assert.deepEqual(r.results.find((x) => x.file === "r1.js")?.expected, ["L002"]);
  } finally { clean(forged, hidden); }
});

test("rejects refused with their declared code are tallied beside the reject tally", async () => {
  const hidden = hiddenSet({ "a1.js": GOOD }, {
    "r1.js": BAD,
    "r2.js": BAD.replace("(expect: L002)", "(expect: B999)"),
    "r3.js": BAD.replace(" (expect: L002)", ""),
  });
  try {
    const r = await score(REFERENCE, hidden);
    assert.deepEqual(r.reject, { pass: 3, of: 3 });
    assert.deepEqual(r.declared, { pass: 1, of: 2 });
    const cli = spawnSync(process.execPath, [CLI, REFERENCE, hidden], { encoding: "utf8" });
    assert.equal(cli.status, 0, cli.stdout + cli.stderr);
    assert.match(cli.stdout, /reject 3\/3 \(1\/2 with a declared code\)/);
  } finally { clean(hidden); }
});

test("the reference gets its declared code from all 21 hidden rejects", async () => {
  const r = await score(REFERENCE, join(ROOT, "hidden"));
  assert.deepEqual(r.declared, { pass: 21, of: 21 });
});

test("the CLI refuses a --timeout above setTimeout's limit with exit 2, and still takes one at it", () => {
  const big = spawnSync(process.execPath, [CLI, REFERENCE, "--timeout", "3000000"], { encoding: "utf8" });
  assert.equal(big.status, 2, big.stdout + big.stderr);
  assert.match(big.stderr, /--timeout/);
  const hidden = hiddenSet({ "a1.js": GOOD }, { "r1.js": BAD });
  try {
    const ok = spawnSync(process.execPath, [CLI, REFERENCE, hidden, "--timeout", String((2 ** 31 - 1) / 1000)], { encoding: "utf8" });
    assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  } finally { clean(hidden); }
});

test("score() refuses a timeout setTimeout cannot hold", async () => {
  await assert.rejects(score(REFERENCE, join(ROOT, "hidden"), { timeoutMs: 2 ** 31 }), RangeError);
  await assert.rejects(score(REFERENCE, join(ROOT, "hidden"), { timeoutMs: 0 }), RangeError);
});

test("a worker that leaves no result has its stderr shown beside NO_RESULT", () => {
  const dies = handin((t) => `${t}\nprocess.stderr.write("CANARY-Mv42ME\\n");\nprocess.exit(3);\n`);
  const hidden = hiddenSet({ "a1.js": GOOD }, { "r1.js": BAD });
  try {
    const cli = spawnSync(process.execPath, [CLI, dies, hidden], { encoding: "utf8" });
    assert.equal(cli.status, 1);
    assert.match(cli.stdout, /NO_RESULT/);
    assert.match(cli.stderr, /CANARY-Mv42ME/);
  } finally { clean(dies, hidden); }
});

test("the stderr shown is bounded", () => {
  // a pipe is written asynchronously on macOS, so wait for the write before exiting
  const spams = handin((t) => `${t}\nawait new Promise((done) => process.stderr.write("x".repeat(1e6) + "TAIL-Mv42ME\\n", done));\nprocess.exit(3);\n`);
  const hidden = hiddenSet({ "a1.js": GOOD }, { "r1.js": BAD });
  try {
    const cli = spawnSync(process.execPath, [CLI, spams, hidden], { encoding: "utf8" });
    assert.match(cli.stderr, /TAIL-Mv42ME/);
    assert.ok(cli.stderr.length < 20000, `${cli.stderr.length} chars`);
  } finally { clean(spams, hidden); }
});
