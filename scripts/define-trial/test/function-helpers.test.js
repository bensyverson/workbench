// 3YNVB3 item 6: a top-level function declaration is a helper through the checker too, vouched for by its text.
// @ts-nocheck: lambdas name the Dialect's free names, which TypeScript cannot see.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { helperSources } from "../checker/examples.js";
import { checkDir } from "../checker/index.js";

const VALID = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "valid");

test("helperSources holds a function declaration's text beside the consts'", () => {
  assert.deepEqual(helperSources("const a = 1;\nexport function f(v) { return v; }\n"), { a: "1", f: "function f(v) { return v; }" });
});

/** The passing fixture with examples/01.js's late channel calling `scaled`, declared as `decl` before the export. @param {string} decl */
async function withHelper(decl) {
  const dir = mkdtempSync(join(tmpdir(), "define-trial-"));
  try {
    cpSync(VALID, dir, { recursive: true });
    const path = join(dir, "examples", "01.js"), src = readFileSync(path, "utf8");
    const from = "(c, u) => c.pulse * 0.5";
    assert.equal(src.split(from).length, 2);
    writeFileSync(path, `${decl}\n${src.replace(from, "(c, u) => c.pulse * scaled(0.5)")}`);
    return await checkDir(dir);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test("a function-declaration helper checks clean through checkDir; one reassigned to another function is refused", async () => {
  const ok = await withHelper("function scaled(v) { return v * 2; }");
  assert.deepEqual(ok.diagnostics.filter((d) => d.severity === "error").map((d) => `${d.code} ${d.message}`), []);
  const bad = await withHelper("function scaled(v) { return v * 2; }\nscaled = (v) => v * 3;");
  assert.ok(bad.diagnostics.some((d) => d.code === "B012"), JSON.stringify(bad.diagnostics.map((d) => d.code)));
});

test("a function declaration reassigned to a closure with the same text is refused: identity, not text, vouches", async () => {
  const mk = "function mk(k) { return function scaled(v) { return v * k; }; }";
  for (const tail of ["scaled = mk(3);", "function init() { scaled = mk(3); }\ninit();"]) {
    const r = await withHelper(`const k = 1;\nfunction scaled(v) { return v * k; }\n${mk}\n${tail}`);
    assert.ok(r.diagnostics.some((d) => d.code === "B012"), tail);
  }
  const ok = await withHelper("const k = 1;\nfunction scaled(v) { return v * k; }");
  assert.deepEqual(ok.diagnostics.filter((d) => d.severity === "error"), []);
});

test("a lowering error inside a function-declaration helper is placed at its line, as an arrow's is", async () => {
  const pad = "// one\n// two\n// three\n";
  const fn = await withHelper(`${pad}function scaled(v) {\n  return v.nope;\n}`);
  const arrow = await withHelper(`${pad}const scaled = (v) => {\n  return v.nope;\n};`);
  const line = (r) => r.diagnostics.filter((d) => d.severity === "error" && /helper 'scaled'/.test(d.message)).map((d) => d.line);
  assert.deepEqual(line(arrow), [5]);
  assert.deepEqual(line(fn), [5]);
});

test("B013 keeps its build-time wording when the name is also a build-time binding of the file, not only another lambda's parameter", async () => {
  const dir = mkdtempSync(join(tmpdir(), "define-trial-"));
  try {
    cpSync(VALID, dir, { recursive: true });
    const path = join(dir, "examples", "01.js");
    const src = readFileSync(path, "utf8")
      .replace('export default ($) => program("glow")', 'export default ($) => {\nconst d = 0.5;\nreturn program("glow")')
      .replace("(c, u) => c.pulse * 0.5", "(c, u) => c.pulse * d") + "\n}\n";
    writeFileSync(path, src);
    const ds = (await checkDir(dir)).diagnostics.filter((d) => d.code === "B013");
    assert.equal(ds.length, 1);
    assert.match(ds[0].message, /build-time code/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
