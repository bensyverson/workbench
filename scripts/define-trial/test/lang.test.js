// The checker's language name: `checkDir(dir, { lang })` and `check.js --lang <name>` read <name>.dialect.js
// and <name>.grammar.js, so a trial of another language (the API pilot's budget planner) uses the same
// checker. The default stays `data`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, cpSync, readFileSync, writeFileSync, renameSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { checkDir, definitionFiles } from "../checker/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const VALID = join(HERE, "..", "fixtures", "valid");
const CLI = join(HERE, "..", "check.js");

/** The passing fixture with its definition files named for `lang`, and the imports that name them. @param {string} lang */
function renamed(lang) {
  const dir = mkdtempSync(join(tmpdir(), "define-trial-lang-"));
  cpSync(VALID, dir, { recursive: true });
  renameSync(join(dir, "data.dialect.js"), join(dir, `${lang}.dialect.js`));
  renameSync(join(dir, "data.grammar.js"), join(dir, `${lang}.grammar.js`));
  const files = [`${lang}.grammar.js`, ...readdirSync(join(dir, "examples")).map((f) => `examples/${f}`)];
  for (const f of files) {
    const p = join(dir, f);
    writeFileSync(p, readFileSync(p, "utf8").replaceAll("data.dialect.js", `${lang}.dialect.js`).replaceAll("data.grammar.js", `${lang}.grammar.js`));
  }
  return dir;
}

test("definitionFiles names the Dialect and Grammar files for a language, data by default", () => {
  assert.deepEqual(definitionFiles(), { dialect: "data.dialect.js", grammar: "data.grammar.js" });
  assert.deepEqual(definitionFiles("budget"), { dialect: "budget.dialect.js", grammar: "budget.grammar.js" });
});

test("definitionFiles refuses a name that is not a plain lower-case word", () => {
  for (const bad of ["", "Budget", "../x", "a.b", "a b"]) assert.throws(() => definitionFiles(bad), TypeError, bad);
});

test("checkDir with { lang } checks <lang>.dialect.js and <lang>.grammar.js", async () => {
  const dir = renamed("budget");
  try {
    const r = await checkDir(dir, { lang: "budget" });
    assert.equal(r.ok, true, JSON.stringify(r.diagnostics));
    assert.ok("budget.dialect.js" in r.files && "budget.grammar.js" in r.files);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("check.js --lang budget checks the renamed fixture clean; without it, the data files are missing (exit 4)", () => {
  const dir = renamed("budget");
  try {
    const ok = spawnSync(process.execPath, [CLI, dir, "--lang", "budget"], { encoding: "utf8" });
    assert.equal(ok.status, 0, ok.stdout + ok.stderr);
    assert.match(ok.stdout, /no violations/);
    const missing = spawnSync(process.execPath, [CLI, dir], { encoding: "utf8" });
    assert.equal(missing.status, 4);
    assert.match(missing.stderr, /data\.dialect\.js/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("check.js --lang with no name, or a bad one, is a bad invocation (exit 2)", () => {
  for (const args of [["--lang"], ["--lang", "../x"]]) {
    const r = spawnSync(process.execPath, [CLI, VALID, ...args], { encoding: "utf8" });
    assert.equal(r.status, 2, args.join(" ") + r.stderr);
  }
});
