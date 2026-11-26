import { test } from "node:test";
import assert from "node:assert/strict";
import { checkManifest, PACKAGE_CODES } from "../index.js";

const H = "sha256-" + "A".repeat(43) + "=";
const good = () => ({
  name: "tiles", version: "0.4.0", kit: "0.4", description: "A grid.",
  entry: { dialect: "tiles.dialect.js", grammar: "tiles.grammar.js", ui: "tiles.ui.js" },
  lib: ["lib/noise.js"], foreign: [{ module: "foreign/svg.js", targets: ["js"], why: "SVG export" }],
  elements: ["elements/board.js"], examples: ["examples/01.js"],
  files: Object.fromEntries(["tiles.dialect.js", "tiles.grammar.js", "tiles.ui.js", "lib/noise.js", "foreign/svg.js", "elements/board.js", "examples/01.js"].map((p) => [p, H])),
});
const codes = (/** @type {unknown} */ m) => checkManifest(typeof m === "string" ? m : JSON.stringify(m)).diagnostics.map((d) => d.code);

test("a complete manifest passes and comes back parsed", () => {
  const r = checkManifest(JSON.stringify(good()));
  assert.deepEqual(r.diagnostics, []);
  assert.equal(r.manifest?.name, "tiles");
  assert.deepEqual(r.manifest?.entry, good().entry);
});

test("the smallest manifest passes", () => {
  const m = { name: "a", version: "1.0.0", kit: "0.4", entry: { dialect: "a.js", grammar: "b.js" }, files: { "a.js": H, "b.js": H } };
  assert.deepEqual(codes(m), []);
});

test("text that is not JSON, or not an object, is K001 with no manifest", () => {
  for (const t of ["", "{", "[]", "null", "3"]) {
    const r = checkManifest(t);
    assert.deepEqual(r.diagnostics.map((d) => d.code), ["K001"], t);
    assert.equal(r.manifest, null);
  }
});

test("every diagnostic has a message and a fix", () => {
  const m = good();
  /** @type {any} */ (m).dependencies = {};
  const r = checkManifest(JSON.stringify({ ...m, name: "Bad Name" }));
  assert.ok(r.diagnostics.length >= 2);
  for (const d of r.diagnostics) { assert.ok(d.message && d.fix && d.severity === "error"); assert.ok(d.code in PACKAGE_CODES); }
});

test("an unknown top-level key is K002, naming it (dependencies included)", () => {
  const r = checkManifest(JSON.stringify({ ...good(), dependencies: { other: "1" } }));
  assert.deepEqual(r.diagnostics.map((d) => d.code), ["K002"]);
  assert.match(r.diagnostics[0].message, /dependencies/);
  assert.equal(r.manifest, null);
});

test("required fields: name, version, kit, entry (dialect, grammar), files", () => {
  for (const k of ["name", "version", "kit", "entry", "files"]) {
    const m = /** @type {any} */ (good()); delete m[k];
    assert.ok(codes(m).includes("K002"), k);
  }
  for (const k of ["dialect", "grammar"]) {
    const m = good(); delete (/** @type {any} */ (m.entry))[k];
    assert.ok(codes(m).includes("K002"), k);
  }
  const m = good(); delete (/** @type {any} */ (m.entry)).ui;
  assert.deepEqual(codes(m), []);
});

test("name is lowercase letters and digits, starting with a letter", () => {
  for (const n of ["Tiles", "1x", "a-b", "a_b", "", "a b", 3]) assert.ok(codes({ ...good(), name: n }).includes("K002"), String(n));
  for (const n of ["a", "tiles2", "x1y"]) assert.deepEqual(codes({ ...good(), name: n }), [], n);
});

test("version is semver; kit is major.minor", () => {
  for (const v of ["1", "1.0", "v1.0.0", "1.0.0.0", "", 1]) assert.ok(codes({ ...good(), version: v }).includes("K002"), String(v));
  for (const v of ["0.0.1", "10.20.30", "1.0.0-beta.1", "1.0.0+build"]) assert.deepEqual(codes({ ...good(), version: v }), [], v);
  for (const k of ["0", "0.4.1", "x.y", "", 0.4]) assert.ok(codes({ ...good(), kit: k }).includes("K002"), String(k));
});

test("description, when present, is a string", () => {
  assert.ok(codes({ ...good(), description: 3 }).includes("K002"));
});

test("lib, elements and examples are arrays of exact paths; globs are refused", () => {
  for (const k of ["lib", "elements", "examples"]) {
    assert.ok(codes({ ...good(), [k]: "a.js" }).includes("K002"), `${k} not array`);
    assert.ok(codes({ ...good(), [k]: [3] }).includes("K002"), `${k} not strings`);
    assert.ok(codes({ ...good(), [k]: ["examples/*.js"] }).includes("K002"), `${k} glob`);
  }
  const r = checkManifest(JSON.stringify({ ...good(), examples: ["examples/*.js"] }));
  assert.match(r.diagnostics[0].message, /glob|\*/);
});

test("foreign entries are { module, targets, why }", () => {
  for (const f of [[{ module: "foreign/svg.js", targets: ["js"] }], [{ module: "foreign/svg.js", why: "x" }], [{ targets: ["js"], why: "x" }], [{ module: "foreign/svg.js", targets: "js", why: "x" }], ["foreign/svg.js"], [{ module: "foreign/svg.js", targets: ["js"], why: "" }]]) {
    assert.ok(codes({ ...good(), foreign: f }).includes("K002"), JSON.stringify(f));
  }
});

test("paths are normalized and relative: no leading slash, `..`, `.`, backslash or empty part", () => {
  for (const p of ["/a.js", "../a.js", "./a.js", "a//b.js", "a\\b.js", "a/../b.js", ""]) {
    const m = good(); m.entry.dialect = p;
    assert.ok(codes(m).includes("K002"), JSON.stringify(p));
  }
});

test("files maps paths to sha256-<base64>", () => {
  for (const h of ["abc", "sha256-short", "md5-" + "A".repeat(43) + "=", 3]) {
    const m = good(); /** @type {any} */ (m.files)["tiles.ui.js"] = h;
    assert.ok(codes(m).includes("K002"), String(h));
  }
});

test("a file the manifest names but does not list in files is K004", () => {
  for (const edit of [(/** @type {any} */ m) => { m.entry.dialect = "other.js"; }, (/** @type {any} */ m) => { m.lib.push("lib/more.js"); }, (/** @type {any} */ m) => { m.foreign[0].module = "foreign/x.js"; }, (/** @type {any} */ m) => { m.elements = ["e.js"]; }, (/** @type {any} */ m) => { m.examples = ["ex.js"]; }]) {
    const m = good(); edit(m);
    assert.deepEqual(codes(m), ["K004"]);
  }
});
