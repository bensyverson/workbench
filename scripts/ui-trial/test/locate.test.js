// The trial checker's line for each diagnostic: a list item is found by its position in the list, a key in code
// only, so unlabeled or duplicate items and a comment holding a key name do not move a diagnostic.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, copyFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkDir } from "../checker/index.js";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const PKG = join(HERE, "../packages/maze");
const HEAD = `import { defineUI } from "kit/define";\nimport { maze } from "./maze.grammar.js";\n`;

/** The "line code" of each diagnostic a hand-in with this body draws. @param {string} body */
async function lines(body) {
  const dir = mkdtempSync(join(tmpdir(), "j0zqdB-"));
  try {
    for (const f of ["maze.dialect.js", "maze.grammar.js"]) copyFileSync(join(PKG, f), join(dir, f));
    writeFileSync(join(dir, "maze.ui.js"), HEAD + body);
    const r = await checkDir(dir, { lang: "maze" });
    return r.diagnostics.map((d) => `${d.line} ${d.code}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("two text components with no label: the second's bad value is on its own line", async () => {
  assert.deepEqual(await lines(`export const mazeUI = defineUI(maze, {
  tiles: { a: { title: "A", place: { splitBelow: "stage" }, body: [
    { kind: "text", value: "hello" },
    { kind: "text", value: 42 },
  ] } },
});
`), ["6 U012"]);
});

test("two stats with the same label: the second's bad path is on its own line", async () => {
  assert.deepEqual(await lines(`export const mazeUI = defineUI(maze, {
  tiles: { a: { title: "A", place: { splitBelow: "stage" }, body: [
    { kind: "stat", label: "s", value: "score" },
    { kind: "stat", label: "s", value: "bogus" },
  ] } },
});
`), ["6 U005"]);
});

test("a comment holding a key name before the real key does not take the line", async () => {
  assert.deepEqual(await lines(`export const mazeUI = defineUI(maze, {
  tiles: { a: {
    title: "A",
    // place: below the stage
    place: {},
    body: [{ kind: "text", value: "x" }],
  } },
});
`), ["7 U004"]);
});

test("a string holding a key name does not take the line", async () => {
  assert.deepEqual(await lines(`export const mazeUI = defineUI(maze, {
  tiles: { a: {
    title: "the place: here",
    place: {},
    body: [{ kind: "text", value: "x" }],
  } },
});
`), ["6 U004"]);
});

test("row items without distinct labels: the second's bad value is on its own line", async () => {
  assert.deepEqual(await lines(`export const mazeUI = defineUI(maze, {
  tiles: { a: { title: "A", place: { splitBelow: "stage" }, body: [
    { kind: "row", items: [
      { kind: "plot", label: "p", y: "score", window: 10 },
      { kind: "plot", label: "p", y: "bogus", window: 10 },
    ] },
  ] } },
});
`), ["7 U005"]);
});

test("a multi-line lambda and two identical bad lambdas keep their lines", async () => {
  assert.deepEqual(await lines(`export const mazeUI = defineUI(maze, {
  tiles: { a: { title: "A", place: { splitBelow: "stage" }, body: [
    { kind: "check", label: "c", expect: (s) => {
      const k = 1;
      return s.bogus > k;
    } },
    { kind: "check", label: "d", expect: (s) => s.bogus > 0 },
    { kind: "check", label: "e", expect: (s) => s.bogus > 0 },
  ] } },
});
`), ["7 U007", "9 U007", "10 U007"]);
});
