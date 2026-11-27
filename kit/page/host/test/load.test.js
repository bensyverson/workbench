// The host's loader on the real kit: the draw trial's massaged compose leg and the seams trial's bounce and swarm
// load, compose, and run, from folders read the way the page reads a fetch; and each refusal reaches a diagnostic.
// Modules are imported from data: URLs here (the page uses blob: URLs).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { readPackageDir } from "../../../../scripts/pkg/dir.js";
import { createRun } from "../../../run/index.js";
import { loadWorkbench, loadPreset } from "../load.js";

const kit = (/** @type {string} */ p) => new URL(`../../../${p}`, import.meta.url).href;
/** @type {import("../load.js").LoadEnv} */
const env = {
  urls: { define: kit("define/index.js"), compose: kit("compose/index.js") },
  makeUrl: (text) => `data:text/javascript;base64,${Buffer.from(text).toString("base64")}`,
  importUrl: (url) => import(url),
};
const root = (/** @type {string} */ p) => fileURLToPath(new URL(`../../../../${p}`, import.meta.url));

const DRAW = "scripts/draw-trial/massaged/2026-11-26-compose";
const SEAMS = "scripts/seams-trial/fixtures/valid-3";

/** @param {string} dir @param {string[]} names @param {string} [profile] */
async function workbench(dir, names, profile) {
  const packages = Object.fromEntries(names.map((n) => [n, readPackageDir(root(`${dir}/${n}`))]));
  const text = readFileSync(root(`${dir}/${dir === DRAW ? "workbench.js" : "compose/workbench.js"}`), "utf8");
  return loadWorkbench({ packages, glue: { path: "workbench.js", text }, ...(profile ? { profile } : {}) }, env);
}

test("the draw trial's compose leg loads, builds and runs", async () => {
  const w = await workbench(DRAW, ["maze", "particles", "arcade"]);
  assert.deepEqual(w.diagnostics.filter((d) => d.severity === "error"), []);
  assert.equal(w.composed.name, "arcade-maze");
  assert.match(w.plan.join("\n"), /dungeon\.out\.coin → sparks\.in\.burst/);
  const run = createRun(w.composed, { runtimes: w.runtimes });
  run.runUntil(1);
  assert.deepEqual(run.diagnostics.filter((d) => d.severity === "error"), []);
  assert.ok(w.packages.every((p) => p.loaded.runtime));
  assert.equal(w.sourceName, "workbench.js");
});

test("a renderer profile is kept on the record, and a glue the profile refuses is a diagnostic with its code", async () => {
  const w = await workbench(DRAW, ["maze", "particles", "arcade"], "gameboy");
  assert.ok(w.diagnostics.some((d) => d.code === "S401" && d.severity === "error"), JSON.stringify(w.diagnostics.map((d) => d.code)));
  assert.equal(w.composed, null);
  assert.match(w.diagnostics.find((d) => d.code === "S401")?.text ?? "", /workbench\.js:\d+: S401/);
});

test("the seams trial's bounce and swarm load and run", async () => {
  const w = await workbench(SEAMS, ["bounce", "swarm"]);
  assert.deepEqual(w.diagnostics.filter((d) => d.severity === "error"), []);
  const run = createRun(w.composed, { runtimes: w.runtimes });
  run.runUntil(2);
  assert.deepEqual(run.diagnostics.filter((d) => d.severity === "error"), []);
});

test("a package that does not load gives its K diagnostics, and nothing after it runs", async () => {
  const files = readPackageDir(root(`${DRAW}/maze`));
  files["maze.dialect.js"] = `${files["maze.dialect.js"]}\n// edited`;
  const w = await loadWorkbench({ packages: { maze: files }, glue: { path: "workbench.js", text: "export default () => 1;" } }, env);
  assert.deepEqual(w.diagnostics.map((d) => d.code), ["K006"]);
  assert.equal(w.composed, null);
});

test("a package that imports a Node built-in is refused before any of it runs", async () => {
  const files = readPackageDir(root(`${DRAW}/maze`));
  files["maze.runtime.js"] = `import fs from "node:fs";\n${files["maze.runtime.js"]}`;
  const w = await loadWorkbench({ packages: { maze: files }, glue: { path: "workbench.js", text: "export default () => 1;" } }, env);
  assert.ok(w.diagnostics.length > 0 && w.diagnostics.every((d) => d.code === "K007"), JSON.stringify(w.diagnostics.map((d) => d.code)));
});

test("a glue that imports something else is S-free K007 and one that is not a composition says so", async () => {
  const packages = { maze: readPackageDir(root(`${DRAW}/maze`)) };
  const bad = await loadWorkbench({ packages, glue: { path: "g.js", text: 'import fs from "node:fs";\nexport default () => 1;' } }, env);
  assert.equal(bad.diagnostics[0]?.code, "K007");
  const notOne = await loadWorkbench({ packages, glue: { path: "g.js", text: "export default () => 1;" } }, env);
  assert.equal(notOne.diagnostics[0]?.code, "LOAD");
  assert.match(notOne.diagnostics[0]?.message ?? "", /not a function/);
});

test("a glue whose wire does not fit gives the S diagnostic with the glue's line", async () => {
  const packages = Object.fromEntries(["maze", "particles", "arcade"].map((n) => [n, readPackageDir(root(`${DRAW}/${n}`))]));
  const text = readFileSync(root(`${DRAW}/workbench.js`), "utf8").replace('.wire(dungeon.out.coin, sparks.in.burst, { rename: { cell: "at" } })', ".wire(dungeon.out.coin, sparks.in.burst)");
  const w = await loadWorkbench({ packages, glue: { path: "workbench.js", text } }, env);
  const s = w.diagnostics.find((d) => d.code.startsWith("S") && d.severity === "error");
  assert.ok(s, JSON.stringify(w.diagnostics.map((d) => d.code)));
  assert.ok(typeof s.line === "number" && s.line > 0);
  assert.equal(w.composed, null);
});

test("a package's example loads as a one-part preset", async () => {
  const packages = { particles: readPackageDir(root(`${DRAW}/particles`)) };
  const w = await loadPreset({ packages, package: "particles", example: "examples/01.js" }, env);
  assert.deepEqual(w.diagnostics.filter((d) => d.severity === "error"), []);
  const run = createRun(w.composed, { runtimes: w.runtimes });
  run.runUntil(1);
  assert.ok(run.state("fountain"));
  const missing = await loadPreset({ packages, package: "particles", example: "examples/99.js" }, env);
  assert.equal(missing.diagnostics[0]?.code, "LOAD");
});
