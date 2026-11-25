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
