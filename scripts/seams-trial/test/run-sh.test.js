// The seams relay launcher (leaf WnmLua): it sets each leg's directory up (the docs, the task, the tools and the
// starting or handed-in packages; a composer's generated reference.md), keeps its directory guards, and starts the
// agent with the brief. A stand-in `claude` on PATH records its cwd and brief, so no agent runs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, existsSync, readFileSync, realpathSync, cpSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = realpathSync(fileURLToPath(new URL("../../../", import.meta.url)));
const SCRIPT = join(REPO, "scripts/seams-trial/run.sh");
const VALID_2 = join(REPO, "scripts/seams-trial/fixtures/valid-2");

const scratch = realpathSync(mkdtempSync(join(tmpdir(), "WnmLua-runsh-")));
const fakeBin = join(scratch, "bin");
const fakeHome = join(scratch, "home");
mkdirSync(fakeBin);
mkdirSync(join(fakeHome, ".claude"), { recursive: true });
writeFileSync(join(fakeBin, "claude"), '#!/bin/sh\npwd -P > "$CLAUDE_CWD_FILE"\nprintf %s "$2" > "$CLAUDE_CWD_FILE.brief"\n');
chmodSync(join(fakeBin, "claude"), 0o755);

/** Runs the launcher with the stand-in claude. @param {string[]} args @param {Record<string, string>} [env] */
function launch(args, env = {}) {
  const cwdFile = join(scratch, `cwd-${Math.random().toString(36).slice(2)}`);
  const base = { ...process.env };
  delete base.PACKET;
  const r = spawnSync("sh", [SCRIPT, ...args], { cwd: scratch, encoding: "utf8", env: { ...base, PATH: `${fakeBin}:${process.env.PATH}`, HOME: fakeHome, CLAUDE_CWD_FILE: cwdFile, ...env } });
  return { status: r.status, stderr: r.stderr, started: existsSync(cwdFile) ? readFileSync(cwdFile, "utf8").trim() : null, brief: existsSync(`${cwdFile}.brief`) ? readFileSync(`${cwdFile}.brief`, "utf8") : "" };
}

test("an author's leg gets the four docs, its task, check.sh, hash.sh and the starting package, and the brief names them", () => {
  const dir = join(scratch, "r1-particles");
  const r = launch(["particles", dir, "model-x"]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.started, dir);
  for (const f of ["seams.md", "runtime.md", "packaging.md", "rules.md", "task.md", "check.sh", "hash.sh", "particles/wb-package.json"]) assert.ok(existsSync(join(dir, f)), f);
  assert.equal(existsSync(join(dir, "reference.md")), false);
  assert.match(readFileSync(join(dir, "task.md"), "utf8"), /particles author/);
  assert.match(r.brief, /`runtime\.md`/);
  assert.doesNotMatch(r.brief, /reference\.md|<EXTRA>|<DIR>|<FOLDERS>/);
  assert.match(r.brief, new RegExp(`Work only in \`${dir}\``));
  // the starting package has no runtime: its check.sh runs and says so
  const c = spawnSync("sh", [join(dir, "check.sh")], { encoding: "utf8" });
  assert.equal(c.status, 1, c.stderr);
  assert.match(c.stdout, /G001/);
  assert.match(readFileSync(join(dir, "log.jsonl"), "utf8"), /"G001"/);
});

test("a compose leg copies both authors' packages and gets reference.md, and its check.sh passes the reference hand-in", () => {
  const maze = join(scratch, "legs", "maze-leg"), parts = join(scratch, "legs", "particles-leg");
  cpSync(join(VALID_2, "maze"), join(maze, "maze"), { recursive: true });
  cpSync(join(VALID_2, "particles"), join(parts, "particles"), { recursive: true });
  const dir = join(scratch, "r1-compose");
  const r = launch(["compose", dir, "model-x", maze, parts]);
  assert.equal(r.status, 0, r.stderr);
  for (const f of ["seams.md", "runtime.md", "packaging.md", "rules.md", "task.md", "check.sh", "maze/maze.runtime.js", "particles/particles.runtime.js"]) assert.ok(existsSync(join(dir, f)), f);
  assert.equal(existsSync(join(dir, "hash.sh")), false);
  assert.match(readFileSync(join(dir, "reference.md"), "utf8"), /# maze 0\.2\.0[\s\S]*`coin`[\s\S]*# particles 0\.2\.0[\s\S]*`burst`/);
  assert.match(r.brief, /`reference\.md`/);
  cpSync(join(VALID_2, "compose/workbench.js"), join(dir, "workbench.js"));
  const c = spawnSync("sh", [join(dir, "check.sh")], { encoding: "utf8" });
  assert.equal(c.status, 0, c.stdout + c.stderr);
  assert.match(c.stdout, /run: burst of 24 particles/);
});

test("the packet switch: the default is docs/, PACKET=placeholder copies docs-placeholder/'s seams.md and runtime.md", () => {
  const docs = join(REPO, "scripts/seams-trial/docs"), placeholder = join(REPO, "scripts/seams-trial/docs-placeholder");
  const plain = join(scratch, "p-default");
  assert.equal(launch(["maze", plain, "model-x"]).status, 0);
  const swapped = join(scratch, "p-placeholder");
  const r = launch(["maze", swapped, "model-x"], { PACKET: "placeholder" });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.started, swapped);
  for (const f of ["seams.md", "runtime.md"]) {
    assert.equal(readFileSync(join(plain, f), "utf8"), readFileSync(join(docs, f), "utf8"), f);
    assert.equal(readFileSync(join(swapped, f), "utf8"), readFileSync(join(placeholder, f), "utf8"), f);
    assert.notEqual(readFileSync(join(swapped, f), "utf8"), readFileSync(join(docs, f), "utf8"), f);
  }
  for (const f of ["packaging.md", "rules.md", "task.md", "check.sh", "hash.sh", "maze/wb-package.json"]) assert.ok(existsSync(join(swapped, f)), f);
  assert.match(r.brief, new RegExp(`Work only in \`${swapped}\``));
  // an unknown packet is refused before anything is made or started
  const bad = join(scratch, "p-bad");
  const b = launch(["maze", bad, "model-x"], { PACKET: "nonesuch" });
  assert.equal(b.status, 2);
  assert.equal(b.started, null);
  assert.equal(existsSync(bad), false);
  assert.match(b.stderr, /PACKET/);
});

test("the guards hold with PACKET=placeholder too", () => {
  for (const dir of ["rel/x", join(REPO, "local", "KTrmEL-x"), join(fakeHome, ".claude", "x")]) {
    const r = launch(["maze", dir, "model-x"], { PACKET: "placeholder" });
    assert.equal(r.status, 2, dir);
    assert.equal(r.started, null);
  }
});

test("the guards: a relative directory, one inside the repository and one inside ~/.claude are refused", () => {
  for (const dir of ["rel/x", join(REPO, "local", "WnmLua-x"), join(fakeHome, ".claude", "x")]) {
    const r = launch(["maze", dir, "model-x"]);
    assert.equal(r.status, 2, dir);
    assert.equal(r.started, null);
  }
  assert.equal(launch(["compose", join(scratch, "c2"), "model-x"]).status, 2, "a compose leg names both author legs");
});
