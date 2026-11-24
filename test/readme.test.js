// Keeps README.md's Quick Start honest: the Program it shows is the file in examples/, and every command in it
// is run from the repo root and must print what the README says it prints (a line that is just `…` in the shown
// output would stand for lines cut for length). The GLSL half of the harness snippet needs `sleepy`; where it is absent
// the snippet says so and only its JS line is checked, and GLSL's worst difference (a GPU's own number) is masked.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { findSleepy } from "../scripts/shader-diff/sleepy.js";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const readme = readFileSync(`${ROOT}README.md`, "utf8");

/**
 * The Quick Start's fenced blocks, in order.
 * @returns {Array<{ lang: string, text: string }>}
 */
function quickStartBlocks() {
  const start = readme.indexOf("\n## Quick Start");
  assert.ok(start >= 0, "README.md has a Quick Start section");
  const end = readme.indexOf("\n## ", start + 1);
  const section = readme.slice(start, end < 0 ? undefined : end);
  return [...section.matchAll(/```(\w*)\n([\s\S]*?)```/g)].map((m) => ({ lang: m[1], text: m[2] }));
}

/**
 * Whether `actual` is `shown`, where a `…` line in `shown` stands for any run of lines.
 * @param {string} shown
 * @param {string} actual
 * @returns {boolean}
 */
function matchesShown(shown, actual) {
  const parts = shown.trimEnd().split(/^…\n?/m);
  let at = 0;
  for (let i = 0; i < parts.length; i++) {
    const part = i === parts.length - 1 ? parts[i].trimEnd() : parts[i];
    if (i === 0 && !actual.startsWith(part)) return false;
    const found = actual.indexOf(part, at);
    if (found < 0) return false;
    at = found + part.length;
  }
  const last = parts[parts.length - 1].trimEnd();
  return parts.length === 1 ? actual.trimEnd() === last : actual.trimEnd().endsWith(last);
}

const blocks = quickStartBlocks();
const files = blocks.filter((b) => b.lang === "js");
const commands = blocks.map((b, i) => ({ b, out: blocks[i + 1] })).filter(({ b, out }) => b.lang === "sh" && out && out.lang === "");

test("the Quick Start shows the Program from examples/rings.js, as written", () => {
  assert.equal(files.length, 1, "one js block: the Program");
  assert.equal(files[0].text, readFileSync(`${ROOT}examples/rings.js`, "utf8"));
});

test("the Quick Start runs five commands: IR, JS, GLSL, the harness and a type error", () => {
  assert.equal(commands.length, 5);
});

for (const { b, out } of commands) {
  const title = b.text.split("\n").find((l) => l.startsWith("import {") && !l.includes("examples/")) ?? "command";
  test(`Quick Start command prints what the README shows: ${title.slice(0, 70)}`, () => {
    const r = spawnSync("sh", ["-c", b.text], { cwd: ROOT, encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    const harness = b.text.includes("runCase");
    if (harness && !findSleepy()) {
      assert.match(r.stdout, /^interpreter vs JS:\s+worst 0\.00e\+0 \(identical bits required\)$/m);
      assert.match(r.stdout, /GLSL skipped/);
      return;
    }
    const mask = (/** @type {string} */ s) => (harness ? s.replace(/worst \S+/g, "worst N") : s);
    assert.ok(matchesShown(mask(out.text), mask(r.stdout)), `README shows:\n${out.text}\nbut it prints:\n${r.stdout}`);
  });
}
