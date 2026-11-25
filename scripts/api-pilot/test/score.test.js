// The pilot's scorer: a hand-in's budget.dialect.js and budget.grammar.js against the hidden programs. An
// accept program passes when it checks with no error; a reject program passes when it gets at least one
// error in its own file. The reference passes every hidden program.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, cpSync, writeFileSync, appendFileSync, rmSync } from "node:fs";
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

// Review of 81a0eee: candidate code must not be able to end or hang the scorer.
/** A hand-in: the reference's definitions with `extra` appended to its grammar. @param {string} extra */
function handinWith(extra) {
  const dir = mkdtempSync(join(tmpdir(), "api-pilot-handin-"));
  cpSync(join(REFERENCE, "budget.dialect.js"), join(dir, "budget.dialect.js"));
  cpSync(join(REFERENCE, "budget.grammar.js"), join(dir, "budget.grammar.js"));
  appendFileSync(join(dir, "budget.grammar.js"), `\n${extra}\n`);
  return dir;
}

test("a candidate that calls process.exit(0) fails every program, and the CLI exits 1", async () => {
  const handin = handinWith("process.exit(0);");
  const hidden = hiddenSet({ "a1.js": GOOD }, { "r1.js": BAD });
  try {
    const r = await score(handin, hidden);
    assert.ok(r.results.length === 2 && r.results.every((x) => !x.pass));
    assert.equal(r.definitions.ok, false);
    const cli = spawnSync(process.execPath, [CLI, handin, hidden], { encoding: "utf8" });
    assert.equal(cli.status, 1, cli.stdout + cli.stderr);
    assert.match(cli.stdout, /definitions: FAIL/);
  } finally { rmSync(handin, { recursive: true, force: true }); rmSync(hidden, { recursive: true, force: true }); }
});

test("a candidate with an endless loop fails every program once the timeout passes", async () => {
  const handin = handinWith("for (;;) {}");
  const hidden = hiddenSet({ "a1.js": GOOD }, { "r1.js": BAD });
  try {
    const t0 = Date.now();
    const r = await score(handin, hidden, { timeoutMs: 1500 });
    assert.ok(Date.now() - t0 < 20000);
    assert.ok(r.results.length === 2 && r.results.every((x) => !x.pass));
    assert.match(r.definitions.codes.join(","), /TIMEOUT/);
    const cli = spawnSync(process.execPath, [CLI, handin, hidden, "--timeout", "1.5"], { encoding: "utf8", timeout: 30000 });
    assert.equal(cli.status, 1, cli.stdout + cli.stderr);
  } finally { rmSync(handin, { recursive: true, force: true }); rmSync(hidden, { recursive: true, force: true }); }
});

test("the CLI rejects a bad --timeout with exit 2", () => {
  const r = spawnSync(process.execPath, [CLI, REFERENCE, "--timeout", "abc"], { encoding: "utf8" });
  assert.equal(r.status, 2);
});

// Review of 81a0eee: a reject program refused for an incidental reason still passes, but is reported.
test("a reject program refused with none of its declared codes passes with a warning; a declared code does not warn", async () => {
  const hidden = hiddenSet({ "a1.js": GOOD }, {
    "r1.js": BAD.replace("REJECT 1: f.nope", "REJECT 1: f.nope (expect: B999, L002)"),
    "r2.js": BAD.replace("REJECT 1: f.nope", "REJECT 1: f.nope (expect: B999)"),
    "r3.js": BAD,
  });
  try {
    const r = await score(REFERENCE, hidden);
    assert.ok(r.results.filter((x) => x.kind === "reject").every((x) => x.pass));
    assert.deepEqual(r.results.find((x) => x.file === "r2.js")?.expected, ["B999"]);
    assert.equal(r.warnings.length, 1);
    assert.match(r.warnings[0], /reject\/r2\.js.*L002.*B999/);
    const cli = spawnSync(process.execPath, [CLI, REFERENCE, hidden], { encoding: "utf8" });
    assert.match(cli.stdout, /warning: reject\/r2\.js/);
    assert.equal(cli.status, 0, cli.stdout + cli.stderr);
  } finally { rmSync(hidden, { recursive: true, force: true }); }
});

test("the reference gets the declared code from every hidden reject program, with no warning", async () => {
  const r = await score(REFERENCE, join(ROOT, "hidden"));
  assert.deepEqual(r.warnings, []);
  assert.ok(r.results.filter((x) => x.kind === "reject").every((x) => x.expected.length > 0));
});


// Leaf 8vQJOw: the particles reference is scored with the same scorer, so the language is a choice.
test("--lang names the definition files: the budget reference copied as particles.*.js scores under --lang particles", async () => {
  const dir = mkdtempSync(join(tmpdir(), "score-lang-"));
  try {
    const hidden = join(dir, "hidden");
    for (const k of ["accept", "reject"]) mkdirSync(join(hidden, k), { recursive: true });
    writeFileSync(join(hidden, "accept", "a.js"), GOOD.replaceAll("budget.grammar.js", "particles.grammar.js"));
    writeFileSync(join(hidden, "reject", "r.js"), BAD.replaceAll("budget.grammar.js", "particles.grammar.js"));
    const handin = join(dir, "handin");
    mkdirSync(handin);
    cpSync(join(REFERENCE, "budget.dialect.js"), join(handin, "particles.dialect.js"));
    writeFileSync(join(handin, "particles.grammar.js"), (await import("node:fs")).readFileSync(join(REFERENCE, "budget.grammar.js"), "utf8").replaceAll("./budget.dialect.js", "./particles.dialect.js"));
    const r = await score(handin, hidden, { lang: "particles" });
    assert.deepEqual(r.definitions.codes, []);
    assert.deepEqual([r.accept, r.reject], [{ pass: 1, of: 1 }, { pass: 1, of: 1 }]);
    const cli = spawnSync(process.execPath, [CLI, handin, hidden, "--lang", "particles"], { encoding: "utf8" });
    assert.equal(cli.status, 0, cli.stdout + cli.stderr);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a hand-in's own modules beside its definitions are copied too, so a definition may import one", async () => {
  const dir = mkdtempSync(join(tmpdir(), "score-own-"));
  try {
    const hidden = hiddenSet({ "a.js": GOOD }, { "r.js": BAD });
    const handin = join(dir, "handin");
    mkdirSync(handin);
    const fs = await import("node:fs");
    const dialect = fs.readFileSync(join(REFERENCE, "budget.dialect.js"), "utf8");
    // The reference's dialect, with one import of the hand-in's own module and a use of it.
    writeFileSync(join(handin, "budget.util.js"), "export const OWN = 1;\n");
    writeFileSync(join(handin, "budget.dialect.js"), `import { OWN } from "./budget.util.js";\nif (OWN !== 1) throw new Error("own module");\n${dialect}`);
    cpSync(join(REFERENCE, "budget.grammar.js"), join(handin, "budget.grammar.js"));
    const r = await score(handin, hidden);
    assert.deepEqual(r.definitions.codes, []);
    assert.deepEqual([r.accept, r.reject], [{ pass: 1, of: 1 }, { pass: 1, of: 1 }]);
    rmSync(hidden, { recursive: true, force: true });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a hand-in's own modules in subdirectories are copied too, but its own examples are not", async () => {
  const dir = mkdtempSync(join(tmpdir(), "score-own-sub-"));
  try {
    const hidden = hiddenSet({ "a.js": GOOD }, { "r.js": BAD });
    const handin = join(dir, "handin");
    mkdirSync(join(handin, "lib", "deep"), { recursive: true });
    mkdirSync(join(handin, "examples"));
    const fs = await import("node:fs");
    const dialect = fs.readFileSync(join(REFERENCE, "budget.dialect.js"), "utf8");
    writeFileSync(join(handin, "lib", "util.js"), 'export { DEEP as OWN } from "./deep/leaf.js";\n');
    writeFileSync(join(handin, "lib", "deep", "leaf.js"), "export const DEEP = 1;\n");
    // The agent's own example program must not collide with the scorer's examples/ folder.
    writeFileSync(join(handin, "examples", "01.js"), "this is not valid javascript (\n");
    writeFileSync(join(handin, "budget.dialect.js"), `import { OWN } from "./lib/util.js";\nif (OWN !== 1) throw new Error("own module");\n${dialect}`);
    cpSync(join(REFERENCE, "budget.grammar.js"), join(handin, "budget.grammar.js"));
    const r = await score(handin, hidden);
    assert.deepEqual(r.definitions.codes, []);
    assert.deepEqual([r.accept, r.reject], [{ pass: 1, of: 1 }, { pass: 1, of: 1 }]);
    rmSync(hidden, { recursive: true, force: true });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
