// The CLI, driven as a binary: its output (the draft's two-sided print), exit codes and the SEAMS_TRIAL_LOG line.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { handIn, sub, remove, FIXTURES } from "../fixture-copy.js";

const CHECK = fileURLToPath(new URL("../check.js", import.meta.url));

/** @param {string[]} args @param {Record<string, string>} [env] */
const run = (args, env = {}) => spawnSync(process.execPath, [CHECK, ...args], { encoding: "utf8", env: { ...process.env, ...env } });

test("usage: no role, an unknown role, or no dir exits 2 with the primer", () => {
  for (const args of [[join(FIXTURES, "maze")], [join(FIXTURES, "maze"), "--role", "tiles"], ["--role", "maze"]]) {
    const r = run(args);
    assert.equal(r.status, 2, args.join(" "));
    assert.match(r.stderr, /usage: node .*--role maze\|particles\|compose/);
  }
  assert.equal(run(["--help"]).status, 0);
});

test("a missing dir exits 4", () => {
  const r = run(["/nonexistent/C0nNGy", "--role", "maze"]);
  assert.equal(r.status, 4);
  assert.match(r.stderr, /does not exist/);
});

test("a clean package exits 0", () => {
  const r = run([join(FIXTURES, "particles"), "--role", "particles"]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /no violations/);
});

test("a wire with no frame path prints both sides and the fix as the draft does, exits 1, and logs the invocation", async () => {
  const dir = await handIn("compose", (d) => { sub(d, "workbench.js", '    .frame(level.frame.cell, fx.frame.px, "fit")\n', ""); });
  const logDir = mkdtempSync(join(tmpdir(), "C0nNGy-log-"));
  const log = join(logDir, "log.jsonl");
  try {
    const r = run([dir, "--role", "compose"], { SEAMS_TRIAL_LOG: log });
    assert.equal(r.status, 1, r.stderr);
    const lines = r.stdout.split("\n");
    assert.match(lines[0], /workbench\.js:41: S251 level\.out\.picked cannot feed fx\.in\.burst: the field 'at' is a point in maze\.cell; burst takes a point in particles\.px, and no frame path joins them$/);
    assert.equal(lines[1], "  from: level.out.picked  Event<{ at: point2@cell }>  (maze 0.2.0)");
    assert.equal(lines[2], "  to:   fx.in.burst       Event<{ at: point2@px }>    (particles 0.3.0)");
    assert.match(lines[3], /^  fix: write \.frame\(level\.frame\.cell, fx\.frame\.px, "fit"\)/);
    const entry = JSON.parse(readFileSync(log, "utf8").trim());
    assert.equal(entry.role, "compose");
    assert.equal(entry.ok, false);
    assert.equal(entry.diagnostics[0].code, "S251");
    assert.equal(entry.loadError, null);
    const j = run([dir, "--role", "compose", "--json"]);
    assert.equal(JSON.parse(j.stdout).diagnostics[0].from.part, "level");
  } finally { remove(dir); rmSync(logDir, { recursive: true, force: true }); }
});

test("a misspelled input prints the part's side with what it has", async () => {
  const dir = await handIn("compose", (d) => { sub(d, "workbench.js", "fx.in.burst", "fx.in.brust"); });
  try {
    const lines = run([dir, "--role", "compose"]).stdout.split("\n");
    assert.match(lines[0], /S111 .wire: part 'fx'/);
    assert.equal(lines[1], "  from: level.out.picked  Event<{ at: point2@cell }>  (maze 0.2.0)");
    assert.equal(lines[2], "  to:   fx.in.brust       has burst, radius           (particles 0.3.0)");
  } finally { remove(dir); }
});
