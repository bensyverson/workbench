import { test } from "node:test";
import assert from "node:assert/strict";
import { touch } from "../h5/summarize.js";

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
