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

test("?, # and % are refused: a URL import would read them as a query, a fragment or an escape", () => {
  for (const p of ["a.mjs#.js", "a.mjs?.js", "x%2ejs", "lib/a#b.js", "lib/a?b.js"]) assert.equal(isPackagePath(p), false, p);
});

test("a UI's element module is named from the UI module's folder (review M4.5): uiModules takes the UI's path", async () => {
  const { uiModules, uiModulePath } = await import("../index.js");
  const ui = { stage: { element: "p-stage", module: "./stage.js" }, tiles: { a: { body: [{ kind: "text", element: "p-x", module: "../x.js" }] } } };
  assert.deepEqual(uiModules(ui, "ui/p.ui.js"), ["ui/stage.js", "x.js"]);
  assert.deepEqual(uiModules({ stage: { element: "p-stage", module: "./stage.js" } }), ["stage.js"], "a UI at the root, the default");
  assert.equal(uiModulePath("ui/p.ui.js", "./stage.js"), "ui/stage.js");
  assert.equal(uiModulePath("p.ui.js", "../out.js"), null);
});

const HASH = "sha256-" + "A".repeat(43) + "=";
test("elementModulePath reads the manifest and names a UI's element module from entry.ui; a bad manifest is a K diagnostic, not a null", async () => {
  const { elementModulePath, MANIFEST_PATH } = await import("../index.js");
  const manifest = (/** @type {any} */ entry) => ({ [MANIFEST_PATH]: JSON.stringify({ name: "p", version: "1.0.0", kit: "0.4", entry: { dialect: "d.js", grammar: "g.js", ...entry }, files: Object.fromEntries(["d.js", "g.js", ...(entry.ui ? [entry.ui] : [])].map((f) => [f, HASH])) }) });
  assert.deepEqual(elementModulePath(manifest({ ui: "ui/p.ui.js" }), "./stage.js"), { path: "ui/stage.js", diagnostics: [] });
  assert.deepEqual(elementModulePath(manifest({}), "./stage.js"), { path: "stage.js", diagnostics: [] }, "no entry.ui: a UI at the root");
  assert.deepEqual(elementModulePath(manifest({ ui: "p.ui.js" }), "../out.js"), { path: null, diagnostics: [] }, "a module that leaves the package");
  const bad = elementModulePath({ [MANIFEST_PATH]: "{ not json" }, "./stage.js");
  assert.equal(bad.path, null);
  assert.deepEqual(bad.diagnostics.map((d) => d.code), ["K001"]);
  assert.deepEqual(elementModulePath({}, "./stage.js").diagnostics.map((d) => d.code), ["K001"], "no manifest");
  assert.deepEqual(elementModulePath({ [MANIFEST_PATH]: new Uint8Array([0xff, 0xfe]) }, "./x.js").diagnostics.map((d) => d.code), ["K001"], "not UTF-8");
});
