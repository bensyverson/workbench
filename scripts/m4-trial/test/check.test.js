// The M4 trial's checker as a command, and run.sh's guards. The checker loads packages exactly as the workbench page
// does (kit/page/host/load.js) and plays them on kit/page; these tests drive it on the draw trial's massaged hand-ins,
// which load and play but are not the M4 trial's game, score or composition, so each fails with the trial's own code.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { hashDir } from "../../pkg/dir.js";

const here = (/** @type {string} */ p) => fileURLToPath(new URL(p, import.meta.url));
const CHECK = here("../check.js");
const RUN = here("../run.sh");
const DRAW = here("../../draw-trial/massaged/2026-11-26-compose");

/** @param {string[]} args @param {Record<string, string>} [env] */
const check = (args, env = {}) => spawnSync(process.execPath, [CHECK, ...args], { encoding: "utf8", env: { ...process.env, ...env } });
/** @param {string} name */
const copy = (name) => { const d = mkdtempSync(join(tmpdir(), "IhJ35P-")); cpSync(join(DRAW, name), join(d, name), { recursive: true }); return join(d, name); };

test("a bad invocation exits 2 with the usage", () => {
  for (const args of [[], ["--role", "game"], ["x", "--role", "nope"], ["x", "y", "--role", "score"]]) {
    const r = check(args);
    assert.equal(r.status, 2, args.join(" "));
    assert.match(r.stderr, /usage:/);
  }
  assert.equal(check(["--help"]).status, 0);
});

test("a missing folder, or one that is not a package, exits 4", () => {
  assert.equal(check(["/nonexistent/IhJ35P", "--role", "game"]).status, 4);
  assert.equal(check([mkdtempSync(join(tmpdir(), "IhJ35P-")), "--role", "score"]).status, 4);
});

test("a game with no pad input is T006, and its examples still load; every run is logged", async () => {
  const log = join(mkdtempSync(join(tmpdir(), "IhJ35P-")), "log.jsonl");
  const game = copy("maze");
  // the massaged maze takes the pad (it is the page host's maze): its input is made one that is not the pad's seam
  const dialect = join(game, "maze.dialect.js");
  writeFileSync(dialect, readFileSync(dialect, "utf8").replace("Event<{ up: bool, down: bool, left: bool, right: bool }>", "Event<{ q: bool }>"));
  // and its UI's declared pad Control goes too (declared Controls, 2026-11-27): it would no longer fit the input (U016)
  const ui = join(game, "maze.ui.js");
  writeFileSync(ui, readFileSync(ui, "utf8").replace(/  controls: \{[\s\S]*?\n  \},\n/, ""));
  await hashDir(game);
  const r = check([game, "--role", "game"], { M4_TRIAL_LOG: log });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /T006 /);
  assert.match(r.stdout, /  fix: /);
  assert.doesNotMatch(r.stdout, /K0\d\d /);
  const entry = JSON.parse(readFileSync(log, "utf8").trim());
  assert.equal(entry.role, "game");
  assert.equal(entry.ok, false);
  assert.ok(entry.codes.includes("T006"), "the codes summary.js counts");
  assert.ok(entry.diagnostics.some((/** @type {any} */ d) => d.code === "T006"));
});

test("a score package whose picture is empty with no events is T011", () => {
  const r = check([copy("particles"), "--role", "score"], { M4_TRIAL_SCORE_SECONDS: "4" });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /T011 /);
});

test("a composition that does not wire the page's pad is T022, and one that loads gives no K, S or LOAD", () => {
  const r = check([DRAW, "--role", "compose", "--given", join(DRAW, "maze"), "--given", join(DRAW, "particles")]);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /T022 /);
  // the kit now says it too, as a warning (S120: a declared Control nothing wires; declared Controls, 2026-11-27)
  assert.match(r.stdout, /S120 \(warning\)/);
  assert.doesNotMatch(r.stdout, /(K|S)\d\d\d (?!\(warning\))|LOAD /);
});

test("a given package that changed is T027", () => {
  const changed = copy("maze");
  const r = check([DRAW, "--role", "compose", "--given", changed.replace(/maze$/, "nothing"), "--given", join(DRAW, "particles")]);
  assert.equal(r.status, 4, r.stdout + r.stderr);
  writeFileSync(join(changed, "examples/01.js"), readFileSync(join(changed, "examples/01.js"), "utf8") + "\n");
  const m = check([DRAW, "--role", "compose", "--given", changed, "--given", join(DRAW, "particles")]);
  assert.equal(m.status, 1);
  assert.match(m.stdout, /T027 .*maze/);
});

test("run.sh refuses a relative, existing, or in-repository directory", () => {
  const sh = (/** @type {string[]} */ args) => spawnSync("sh", [RUN, ...args], { encoding: "utf8" });
  assert.equal(sh(["game", "rel/dir", "sonnet"]).status, 2);
  assert.equal(sh(["game", tmpdir(), "sonnet"]).status, 2);
  assert.equal(sh(["score", here("../fresh-IhJ35P"), "sonnet"]).status, 2);
  assert.equal(sh(["compose", "/private/tmp/IhJ35P-x", "sonnet"]).status, 2);
  assert.equal(sh(["nope", "/private/tmp/IhJ35P-x", "sonnet"]).status, 2);
});

const RUNS = here("../runs/2026-11-26");

test("the game hand-in of run 1 checks clean: its pad input has the page pad's seam (the checker compared the pad's seam text with a parsed seam, so every run was T006)", () => {
  const r = check([join(RUNS, "game-run1/gemgrid"), "--role", "game"]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

/** Run 1's game, copied, with its Control's UI declaration replaced (and, given `rename`, its input and buttons renamed). @param {string} controls @param {boolean} [rename] */
const run1Variant = async (controls, rename = false) => {
  const d = join(mkdtempSync(join(tmpdir(), "aWrZQr-")), "gemgrid");
  cpSync(join(RUNS, "game-run1/gemgrid"), d, { recursive: true });
  /** @param {string} f @param {(s: string) => string} edit */
  const rewrite = (f, edit) => writeFileSync(join(d, f), edit(readFileSync(join(d, f), "utf8")));
  const to = /** @type {Record<string, string>} */ ({ up: "n", down: "s", left: "w", right: "e" });
  if (rename) {
    rewrite("gemgrid.runtime.js", (s) => s.replace(/\b(up|down|left|right)\b/g, (w) => to[w]).replace(/\bpad\b/g, "steer"));
    rewrite("gemgrid.dialect.js", (s) => s.replace('"up", "down", "left", "right"', '"n", "s", "w", "e"')
      .replace('struct({ up: "bool", down: "bool", left: "bool", right: "bool" })', 'struct({ n: "bool", s: "bool", w: "bool", e: "bool" })')
      .replace("pad: {\n        seam: \"Event<{ up: bool, down: bool, left: bool, right: bool }>\"", "steer: {\n        seam: \"Event<{ n: bool, s: bool, w: bool, e: bool }>\""));
  }
  rewrite("gemgrid.ui.js", (s) => s.replace(/  controls: \{[\s\S]*?\n  \},\n/, controls));
  await hashDir(d);
  return d;
};

test("a game steered by a Control of its own name and buttons, with no keys, is played on screen and checks clean (the checker held ArrowRight and ArrowDown, and took only the D-pad's seam)", async () => {
  const d = await run1Variant('  controls: { steer: { kind: "buttons", buttons: ["n", "s", "w", "e"] } },\n', true);
  const r = check([d, "--role", "game"]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test("a game whose input has the D-pad's seam but whose UI declares no Control is T006: nothing on the page steers it", async () => {
  const d = await run1Variant("");
  const r = check([d, "--role", "game"]);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /T006 /);
});

test("the game hand-in of run 2 checks clean", () => {
  const r = check([join(RUNS, "game-run2/gemgrid"), "--role", "game"]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test("the recorded compose hand-in checks clean on the two author hand-ins it was given", () => {
  const r = check([join(RUNS, "compose"), "--role", "compose", "--given", join(RUNS, "game-run1/gemgrid"), "--given", join(RUNS, "score/scoretimer")]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test("the recorded score hand-in checks clean", () => {
  const r = check([join(RUNS, "score/scoretimer"), "--role", "score"], { M4_TRIAL_SCORE_SECONDS: "4" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test("run.sh layer takes relative leg folders and writes a check.sh with absolute --given paths (the legs cd into their own folder, so a relative path reached no package: exit 4)", () => {
  const bin = mkdtempSync(join(tmpdir(), "KYpY7Q-bin-"));
  writeFileSync(join(bin, "claude"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  const dir = join(mkdtempSync(join(tmpdir(), "KYpY7Q-leg-")), "leg");
  const repo = here("../../..").replace(/\/$/, "");
  const r = spawnSync("sh", [RUN, "layer", dir, "sonnet", "scripts/m4-trial/runs/2026-11-26/game-run1", "scripts/m4-trial/runs/2026-11-26/score"], { encoding: "utf8", cwd: repo, env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } });
  assert.equal(r.status, 0, r.stderr);
  const sh = readFileSync(join(dir, "check.sh"), "utf8");
  assert.match(sh, new RegExp(`--given ${repo}/scripts/m4-trial/runs/2026-11-26/game-run1/gemgrid --given ${repo}/scripts/m4-trial/runs/2026-11-26/score/scoretimer`));
  assert.ok(!readFileSync(join(dir, "docs/kit/compose/README.md"), "utf8").includes("The M4 trial's glue"));
});
