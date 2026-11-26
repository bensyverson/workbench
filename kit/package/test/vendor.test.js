// The vendored parser runs in the page, so it must import nothing; kit/test's browser-safe scan reads only .js
// files and the vendored build is .mjs, so this test holds the line for it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { scanImports } from "../imports.js";

const DIR = new URL("../../vendor/acorn/", import.meta.url);
const text = readFileSync(new URL("acorn.mjs", DIR), "utf8");

test("the vendored acorn imports no module and calls no require or dynamic import", () => {
  const scan = scanImports("acorn.mjs", text, []);
  assert.deepEqual(scan.diagnostics, []);
  assert.deepEqual(scan.imports, []);
  assert.doesNotMatch(text, /\brequire\s*\(/);
  assert.doesNotMatch(text, /\bnode:/);
});

test("the vendored files are the ones the README records", () => {
  const readme = readFileSync(new URL("README.md", DIR), "utf8");
  for (const f of ["acorn.mjs", "acorn.d.mts", "LICENSE"]) {
    const sha = createHash("sha256").update(readFileSync(new URL(f, DIR))).digest("hex");
    assert.ok(readme.includes(sha), `README lists the SHA-256 of ${f}`);
  }
});
