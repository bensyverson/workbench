import { test } from "node:test";
import assert from "node:assert/strict";
import { readBundle, writeBundle } from "../index.js";

test("writeBundle then readBundle returns the same map", () => {
  const files = { "b.js": "export {};\n", "a/c.js": "é\n", "wb-package.json": "{}" };
  const r = readBundle(writeBundle(files));
  assert.deepEqual(r.diagnostics, []);
  assert.deepEqual(r.files, files);
});

test("writeBundle is deterministic: format first, paths sorted", () => {
  const a = writeBundle({ "b.js": "1", "a.js": "2" });
  assert.equal(a, writeBundle({ "a.js": "2", "b.js": "1" }));
  const parsed = JSON.parse(a);
  assert.equal(parsed.format, "wb-bundle");
  assert.deepEqual(Object.keys(parsed.files), ["a.js", "b.js"]);
  assert.equal(Object.keys(parsed)[0], "format");
});

test("a malformed bundle is K010 with no files", () => {
  for (const t of ["", "{", "[]", `{"files":{}}`, `{"format":"other","files":{}}`, `{"format":"wb-bundle"}`, `{"format":"wb-bundle","files":[]}`, `{"format":"wb-bundle","files":{"a.js":3}}`, `{"format":"wb-bundle","files":{},"extra":1}`]) {
    const r = readBundle(t);
    assert.deepEqual(r.diagnostics.map((d) => d.code), ["K010"], t);
    assert.equal(r.files, null);
    assert.ok(r.diagnostics[0].fix);
  }
});

test("a bundle path that is not a normalized relative path is refused", () => {
  for (const p of ["/a.js", "../a.js", "a//b.js", "a\\b.js"]) {
    const r = readBundle(JSON.stringify({ format: "wb-bundle", files: { [p]: "" } }));
    assert.deepEqual(r.diagnostics.map((d) => d.code), ["K010"], p);
  }
});
