import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { touch, summarize } from "../h5/summarize.js";

const DIR = "/private/tmp/x-h5/agent-a";

test("a Read inside the directory is not outside; one elsewhere is", () => {
  assert.equal(touch(DIR, "Read", { file_path: `${DIR}/API.md` }).outside, false);
  assert.equal(touch(DIR, "Read", { file_path: "API.md" }).outside, false);
  assert.equal(touch(DIR, "Read", { file_path: "/Users/ben/git/workbench/kit/define/grammar.js" }).outside, true);
  assert.equal(touch(DIR, "Read", { file_path: `${DIR}/../agent-b/REPORT.md` }).outside, true);
});

test("a sibling directory sharing the prefix is outside", () => {
  assert.equal(touch(DIR, "Read", { file_path: `${DIR}-b/API.md` }).outside, true);
});

test("Glob and Grep are judged by their path, defaulting to the directory", () => {
  assert.equal(touch(DIR, "Glob", { pattern: "**/*.js" }).outside, false);
  assert.equal(touch(DIR, "Grep", { pattern: "B013", path: "/Users/ben/git/workbench/kit" }).outside, true);
});

test("a Bash command is outside when it names an absolute path elsewhere", () => {
  assert.equal(touch(DIR, "Bash", { command: "./check.sh" }).outside, false);
  assert.equal(touch(DIR, "Bash", { command: `${DIR}/check.sh 2>/dev/null` }).outside, false);
  assert.equal(touch(DIR, "Bash", { command: `cat ${DIR}/check.sh` }).outside, false);
  assert.equal(touch(DIR, "Bash", { command: "cat /Users/ben/git/workbench/scripts/define-trial/check.js" }).outside, true);
  assert.equal(touch(DIR, "Bash", { command: "ls ../" }).outside, true, "a relative path climbing out counts too");
  assert.equal(touch(DIR, "Bash", { command: "cat ~/.zshrc" }).outside, true);
});

// Review findings (leaf ahT3go).
test("a heredoc body, a // comment marker, a </tag> and a URL are not paths", () => {
  assert.equal(touch(DIR, "Bash", { command: "cat > x.js <<'EOF'\n// a comment\nconst a = '/etc/passwd';\nEOF" }).outside, false);
  assert.equal(touch(DIR, "Bash", { command: "cat > a.html <<EOF\n<canvas></canvas>\nEOF\n./check.sh" }).outside, false);
  assert.equal(touch(DIR, "Bash", { command: "echo '</canvas>' > a.html" }).outside, false);
  assert.equal(touch(DIR, "Bash", { command: "node -e 'f(1) // note'" }).outside, false);
  assert.equal(touch(DIR, "Bash", { command: "curl -s https://example.com/a/b" }).outside, false);
  // The command around a heredoc is still judged.
  assert.equal(touch(DIR, "Bash", { command: "cat > /Users/ben/x.js <<'EOF'\nok\nEOF" }).outside, true);
  assert.equal(touch(DIR, "Bash", { command: "cat <<EOF > ../x\nbody\nEOF" }).outside, true);
});

test("the leaks the first version missed are flagged", () => {
  for (const command of ["find / -name '*.ui.js'", "ls /", "ls / | head", "cat $HOME/.claude/CLAUDE.md", "cat ${HOME}/x", 'cat "$HOME/x"', "cd ~ && ls", "ls ~/git"]) {
    assert.equal(touch(DIR, "Bash", { command }).outside, true, command);
  }
  assert.equal(touch(DIR, "Glob", { pattern: "/Users/ben/git/workbench/**/*.ui.js" }).outside, true);
  assert.equal(touch(DIR, "Glob", { pattern: "~/**/*.md" }).outside, true);
  assert.equal(touch(DIR, "Glob", { pattern: `${DIR}/**/*.js` }).outside, false);
  assert.equal(touch(DIR, "Grep", { pattern: "defineUI", glob: "/Users/**/*.js" }).outside, true);
  assert.equal(touch(DIR, "Grep", { pattern: "x", glob: "**/*.js" }).outside, false);
  assert.equal(touch(DIR, "Read", { file_path: "~/.claude/CLAUDE.md" }).outside, true);
  assert.equal(touch(DIR, "Read", { file_path: "$HOME/x" }).outside, true);
});

test("what a Bash command names through a variable or a substitution is not seen (a documented limit)", () => {
  assert.equal(touch(DIR, "Bash", { command: "R=$(dirname $(grep -o '[^ ]*check.js' check.sh | head -1)); cat $R/fixtures/valid/maze.ui.js" }).outside, false);
});

test("files read through the shell (cat, head, tail, sed -n) are listed", () => {
  const r = (/** @type {string} */ command) => touch(DIR, "Bash", { command }).shellReads;
  assert.deepEqual(r("cat API.md"), ["API.md"]);
  assert.deepEqual(r("cat START.md API.md | head -50"), ["START.md", "API.md"]);
  assert.deepEqual(r("sed -n '1,40p' docs/a.md"), ["docs/a.md"]);
  assert.deepEqual(r("head -n 20 START.md && tail -5 out.log"), ["START.md", "out.log"]);
  assert.deepEqual(r("cat > x.js <<'EOF'\nbody\nEOF"), []);
  assert.deepEqual(r("./check.sh"), []);
  assert.deepEqual(r("ls"), []);
  assert.deepEqual(touch(DIR, "Read", { file_path: "API.md" }).shellReads, []);
});

test("summarize judges a copied run against the directory the agent ran in (the transcript's init cwd)", () => {
  const live = "/private/tmp/ahT3go-live/agent-a";
  const dir = mkdtempSync(join(tmpdir(), "ahT3go-sum-"));
  const lines = [
    { type: "system", subtype: "init", cwd: live, model: "m" },
    { type: "assistant", message: { content: [{ type: "tool_use", name: "Bash", input: { command: `cat ${live}/check.sh` } }, { type: "tool_use", name: "Bash", input: { command: "cat /Users/ben/x" } }, { type: "tool_use", name: "Bash", input: { command: "cat API.md" } }] } },
    { type: "result", subtype: "success" },
  ];
  writeFileSync(join(dir, "transcript.jsonl"), lines.map((l) => JSON.stringify(l)).join("\n"));
  try {
    const s = summarize(dir);
    assert.deepEqual(s.outside, ["Bash: cat /Users/ben/x"]);
    assert.deepEqual(s.shellReads, [`${live}/check.sh`, "/Users/ben/x", "API.md"]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
