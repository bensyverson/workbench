// The package trial launcher's directory guard (a copy of ui-trial's test, for pkg-trial/run.sh): it refuses a directory that is
// relative, inside the repository (however it is spelled: `..`, a symlink) or inside ~/.claude, and starts the agent
// in the canonical directory otherwise. A stand-in `claude` on PATH records its cwd, so no agent runs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, symlinkSync, existsSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = realpathSync(fileURLToPath(new URL("../../../", import.meta.url)));
const SCRIPTS = { "pkg-trial": join(REPO, "scripts/pkg-trial/run.sh") };

const scratch = realpathSync(mkdtempSync(join(tmpdir(), "GZby9I-runsh-")));
const fakeBin = join(scratch, "bin");
const fakeHome = join(scratch, "home");
mkdirSync(fakeBin);
mkdirSync(join(fakeHome, ".claude"), { recursive: true });
writeFileSync(join(fakeBin, "claude"), '#!/bin/sh\npwd -P > "$CLAUDE_CWD_FILE"\nprintf %s "$2" > "$CLAUDE_CWD_FILE.brief"\n');
chmodSync(join(fakeBin, "claude"), 0o755);

/** Runs a launcher with the stand-in claude; returns its exit status, stderr and the directory the agent started in. */
function launch(/** @type {string} */ script, /** @type {string} */ dir, /** @type {string} */ cwd = scratch) {
  const cwdFile = join(scratch, `cwd-${Math.random().toString(36).slice(2)}`);
  const r = spawnSync("sh", [script, dir, "model-x"], { cwd, encoding: "utf8", env: { ...process.env, PATH: `${fakeBin}:${process.env.PATH}`, HOME: fakeHome, CLAUDE_CWD_FILE: cwdFile } });
  return { status: r.status, stderr: r.stderr, started: existsSync(cwdFile) ? readFileSync(cwdFile, "utf8").trim() : null };
}

for (const [name, script] of Object.entries(SCRIPTS)) {
  test(`${name}/run.sh: a fresh absolute directory outside the repository starts the agent there`, () => {
    const dir = join(scratch, `${name}-ok`, "agent-a");
    const r = launch(script, dir);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.started, dir);
    assert.ok(existsSync(join(dir, "check.sh")));
  });

  test(`${name}/run.sh: a relative directory is refused, wherever it points`, () => {
    const r = launch(script, `${name}-rel/agent-a`, scratch);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /absolute/);
    assert.equal(r.started, null);
    assert.equal(existsSync(join(scratch, `${name}-rel`)), false);
    // Relative into the repository, run from inside it.
    const inRepo = launch(script, "zz-GZby9I-rel", REPO);
    assert.equal(inRepo.status, 2);
    assert.equal(existsSync(join(REPO, "zz-GZby9I-rel")), false);
  });

  test(`${name}/run.sh: a directory in the repository is refused however it is spelled`, () => {
    const spellings = [
      `${REPO}/zz-GZby9I-a`,
      `${REPO}/scripts/../zz-GZby9I-b`,
      `${scratch}/../../../../../../../../../..${REPO}/zz-GZby9I-c`,
      `${REPO}/zz-GZby9I-d/e/f`,
    ];
    mkdirSync(join(scratch, `${name}-link-parent`), { recursive: true });
    symlinkSync(REPO, join(scratch, `${name}-link-parent`, "repo-link"));
    spellings.push(`${scratch}/${name}-link-parent/repo-link/zz-GZby9I-e`);
    for (const dir of spellings) {
      const r = launch(script, dir);
      assert.equal(r.status, 2, dir);
      assert.match(r.stderr, /outside the repository/, dir);
      assert.equal(r.started, null, dir);
    }
    for (const n of ["a", "b", "c", "d", "e"]) assert.equal(existsSync(join(REPO, `zz-GZby9I-${n}`)), false, `${n} was created in the repository`);
  });

  test(`${name}/run.sh: a directory under ~/.claude is refused, through a symlink too`, () => {
    for (const dir of [join(fakeHome, ".claude", "x", "agent-a"), `${fakeHome}/.claude/../.claude/y`]) {
      const r = launch(script, dir);
      assert.equal(r.status, 2, dir);
      assert.match(r.stderr, /~\/\.claude|\.claude/, dir);
    }
    symlinkSync(join(fakeHome, ".claude"), join(scratch, `${name}-claude-link`));
    assert.equal(launch(script, join(scratch, `${name}-claude-link`, "z")).status, 2);
  });

  test(`${name}/run.sh: an existing directory, and a '..' in the part that does not exist yet, are refused`, () => {
    mkdirSync(join(scratch, `${name}-exists`));
    assert.equal(launch(script, join(scratch, `${name}-exists`)).status, 2);
    assert.equal(launch(script, `${scratch}/${name}-new/../escape`).status, 2);
  });
}

test("pkg-trial/run.sh: lays the raw materials out loose, writes check.sh and hash.sh, and fills <DIR> into the brief", () => {
  const dir = join(scratch, "layout", "agent-a");
  const cwdFile = join(scratch, "cwd-layout");
  const r = spawnSync("sh", [SCRIPTS["pkg-trial"], dir, "model-x"], { cwd: scratch, encoding: "utf8", env: { ...process.env, PATH: `${fakeBin}:${process.env.PATH}`, HOME: fakeHome, CLAUDE_CWD_FILE: cwdFile } });
  assert.equal(r.status, 0, r.stderr);
  for (const f of ["packaging.md", "rules.md", "task.md", "check.sh", "hash.sh", "out",
    "particles/particles.dialect.js", "particles/particles.grammar.js", "particles/particles.ui.js", "particles/particles-field.js", "particles/examples/01.js", "particles/examples/r01.js",
    "maze/maze.dialect.js", "maze/maze.grammar.js", "maze/maze.ui.js", "maze/examples/01.js"]) assert.ok(existsSync(join(dir, f)), f);
  for (const f of ["particles/wb-package.json", "maze/wb-package.json", "out/particles"]) assert.equal(existsSync(join(dir, f)), false, `${f} is the agent's to make`);
  const check = readFileSync(join(dir, "check.sh"), "utf8");
  assert.match(check, new RegExp(`scripts/pkg-trial/check\\.js ${dir}/out/particles`));
  assert.match(check, new RegExp(`scripts/pkg-trial/check\\.js ${dir}/out/maze`));
  assert.match(check, new RegExp(`PKG_TRIAL_LOG=${dir}/log\\.jsonl`));
  assert.match(readFileSync(join(dir, "hash.sh"), "utf8"), /scripts\/pkg\/hash\.js "\$@"/);
  const brief = readFileSync(`${cwdFile}.brief`, "utf8");
  assert.ok(!brief.includes("<DIR>"));
  assert.ok(brief.includes(dir), "the brief names the agent's directory");
  assert.ok(!brief.startsWith("---"));
});

test("cleanup", () => { rmSync(scratch, { recursive: true, force: true }); });
