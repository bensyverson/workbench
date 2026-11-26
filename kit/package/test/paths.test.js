import { test } from "node:test";
import assert from "node:assert/strict";
import { isPackagePath } from "../paths.js";
import { resolveRelative } from "../paths.js";

test("a normalized relative path is a package path", () => {
  for (const p of ["a.js", "lib/a.js", "a b/c d.js", "x-y_z/1.js"]) assert.equal(isPackagePath(p), true, p);
});

test("an empty, absolute, dotted, backslashed or empty-part path is not", () => {
  for (const p of ["", "/a.js", "./a.js", "../a.js", "a/./b.js", "a/../b.js", "a//b.js", "a/", "a\\b.js"]) assert.equal(isPackagePath(p), false, JSON.stringify(p));
});

test("control characters, a leading or trailing space in a part, a colon and a drive letter are refused", () => {
  for (const p of ["a\0.js", "a\n.js", "a\t.js", "a\x7f.js", " a.js", "a.js ", "lib/ a.js", "lib /a.js", "a:b.js", "C:/x.js", "C:x.js", "c:\\x.js"]) assert.equal(isPackagePath(p), false, JSON.stringify(p));
});

test("resolveRelative joins against the folder of the importing file", () => {
  assert.equal(resolveRelative("a.js", "./lib/b.js"), "lib/b.js");
  assert.equal(resolveRelative("lib/b.js", "../a.js"), "a.js");
  assert.equal(resolveRelative("lib/b.js", "./c.js"), "lib/c.js");
  assert.equal(resolveRelative("a.js", "../x.js"), null);
});

test("resolveRelative refuses a trailing slash or an empty part", () => {
  for (const s of ["./a.js/", "./lib//b.js", ".//a.js", "./lib/", "./"]) assert.equal(resolveRelative("a.js", s), null, s);
});
