// The trial launchers' directory guard (ui-trial/run.sh and particles/h5/run.sh): each refuses a directory that is
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
const SCRIPTS = { "ui-trial": join(REPO, "scripts/ui-trial/run.sh"), h5: join(REPO, "scripts/particles/h5/run.sh") };

const scratch = realpathSync(mkdtempSync(join(tmpdir(), "ahT3go-runsh-")));
const fakeBin = join(scratch, "bin");
const fakeHome = join(scratch, "home");
mkdirSync(fakeBin);
mkdirSync(join(fakeHome, ".claude"), { recursive: true });
writeFileSync(join(fakeBin, "claude"), '#!/bin/sh\npwd -P > "$CLAUDE_CWD_FILE"\n');
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
    const inRepo = launch(script, "zz-ahT3go-rel", REPO);
    assert.equal(inRepo.status, 2);
    assert.equal(existsSync(join(REPO, "zz-ahT3go-rel")), false);
  });

  test(`${name}/run.sh: a directory in the repository is refused however it is spelled`, () => {
    const spellings = [
      `${REPO}/zz-ahT3go-a`,
      `${REPO}/scripts/../zz-ahT3go-b`,
      `${scratch}/../../../../../../../../../..${REPO}/zz-ahT3go-c`,
      `${REPO}/zz-ahT3go-d/e/f`,
    ];
    mkdirSync(join(scratch, `${name}-link-parent`), { recursive: true });
    symlinkSync(REPO, join(scratch, `${name}-link-parent`, "repo-link"));
    spellings.push(`${scratch}/${name}-link-parent/repo-link/zz-ahT3go-e`);
    for (const dir of spellings) {
      const r = launch(script, dir);
      assert.equal(r.status, 2, dir);
      assert.match(r.stderr, /outside the repository/, dir);
      assert.equal(r.started, null, dir);
    }
    for (const n of ["a", "b", "c", "d", "e"]) assert.equal(existsSync(join(REPO, `zz-ahT3go-${n}`)), false, `${n} was created in the repository`);
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

test("cleanup", () => { rmSync(scratch, { recursive: true, force: true }); });
