// @ts-nocheck: the definitions here are minimal and cast loosely.
// Package data files (the package format draft's ruling of 2026-11-26, leaf hca0YM): the file map holds text or
// bytes; a file's hash is over its bytes; a bundle carries bytes as base64; and loadPackage checks each data file
// the Dialect names (K017 not listed, K018 not its kind, K019 a PNG whose size is not the image's), reading a PNG's
// width and height from its IHDR chunk.

import { test } from "node:test";
import assert from "node:assert/strict";
import { defineDialect } from "../../define/index.js";
import { mazeGrammar } from "../../define/fixtures/seams-dialects.js";
import { drawnMazeDecl } from "../../draw/fixtures/draw-dialects.js";
import { loadPackage, checkPackage, hashText, readBundle, writeBundle, readPngSize, PACKAGE_CODES } from "../index.js";
import { pngHeader } from "../fixtures/png.js";

/** The drawn maze with a sheet file and two data files, as one package's definitions. */
function defs(change = (d) => {}) {
  const d = drawnMazeDecl();
  d.images.sheet.file = "art/sheet.png";
  d.files = { orders: { kind: "csv", path: "data/orders.csv", note: "one order a row" }, cfg: { kind: "json", path: "data/cfg.json", note: "the settings" } };
  change(d);
  const dialect = defineDialect(d);
  return { dialect, grammar: mazeGrammar(dialect) };
}
const SRC = {
  "maze.dialect.js": `import { defineDialect } from "kit/define";\n`,
  "maze.grammar.js": `import { defineGrammar } from "kit/define";\nimport "./maze.dialect.js";\n`,
};
const DATA = { "art/sheet.png": pngHeader(16, 8), "data/orders.csv": "id,qty\n1,2\n", "data/cfg.json": `{ "speed": 2 }` };

/** A package's files: `data` replaces the data files, `unlisted` are held but left out of the manifest's files. */
async function files({ data = DATA, unlisted = [] } = {}) {
  const all = { ...SRC, ...data };
  const hashes = {};
  for (const [p, t] of Object.entries(all)) if (!unlisted.includes(p)) hashes[p] = await hashText(t);
  const manifest = { name: "maze", version: "0.1.0", kit: "0.4", entry: { dialect: "maze.dialect.js", grammar: "maze.grammar.js" }, files: hashes };
  return { ...all, "wb-package.json": JSON.stringify(manifest) };
}
const load = async (f, d = defs()) => loadPackage(f, { kitVersion: "0.4", importModule: async (p) => (p === "maze.dialect.js" ? { d: d.dialect } : { g: d.grammar }) });
const codes = (r) => r.diagnostics.map((x) => x.code);

test("a file's hash is over its bytes, so text and its UTF-8 bytes hash the same", async () => {
  const text = "héllo\n";
  assert.equal(await hashText(new TextEncoder().encode(text)), await hashText(text));
  assert.match(await hashText(pngHeader(1, 1)), /^sha256-[A-Za-z0-9+/]{43}=$/);
});

test("readPngSize reads a PNG's width and height from its IHDR chunk, and null for anything else", () => {
  assert.deepEqual(readPngSize(pngHeader(16, 8)), { width: 16, height: 8 });
  assert.deepEqual(readPngSize(pngHeader(70000, 3)), { width: 70000, height: 3 });
  assert.equal(readPngSize(new Uint8Array([1, 2, 3])), null);
  const notIhdr = pngHeader(16, 8);
  notIhdr[12] = 0x58;
  assert.equal(readPngSize(notIhdr), null);
  assert.equal(readPngSize(pngHeader(16, 8).slice(0, 20)), null, "cut short");
});

test("a bundle carries a binary file as { base64 } and reads it back as bytes; text is unchanged", () => {
  const png = pngHeader(16, 8);
  const text = writeBundle({ "b.png": png, "a.js": "x\n" });
  const raw = JSON.parse(text);
  assert.equal(raw.files["a.js"], "x\n");
  assert.deepEqual(Object.keys(raw.files["b.png"]), ["base64"]);
  const back = readBundle(text);
  assert.deepEqual(back.diagnostics, []);
  assert.ok(back.files["b.png"] instanceof Uint8Array);
  assert.deepEqual([...back.files["b.png"]], [...png]);
  assert.equal(back.files["a.js"], "x\n");
  // anything else in place of text is not a bundle
  const bad = (/** @type {unknown} */ v) => readBundle(JSON.stringify({ format: "wb-bundle", files: { "b.png": v } })).diagnostics.map((d) => d.code);
  assert.deepEqual(bad({ base64: "!!" }), ["K010"]);
  assert.deepEqual(bad({ base64: 3 }), ["K010"]);
  assert.deepEqual(bad({ hex: "00" }), ["K010"]);
});

test("checkPackage takes bytes: a data file is hashed as bytes, and a module or the manifest given as bytes is read as UTF-8", async () => {
  const f = await files();
  const enc = (/** @type {string} */ s) => new TextEncoder().encode(s);
  const bytes = { ...f, "maze.grammar.js": enc(f["maze.grammar.js"]), "wb-package.json": enc(f["wb-package.json"]) };
  assert.deepEqual((await checkPackage(bytes, { kitVersion: "0.4" })).diagnostics, []);
  // a module whose bytes are not UTF-8 cannot be read, so it is refused as one that does not parse
  const broken = { ...f, "maze.grammar.js": new Uint8Array([0xff, 0xfe]) };
  const hashes = JSON.parse(f["wb-package.json"]);
  hashes.files["maze.grammar.js"] = await hashText(broken["maze.grammar.js"]);
  broken["wb-package.json"] = JSON.stringify(hashes);
  assert.deepEqual((await checkPackage(broken, { kitVersion: "0.4" })).diagnostics.map((d) => d.code), ["K007"]);
});

test("a package's data files load by path: text and csv as text, json parsed, an image as bytes with its size", async () => {
  const r = await load(await files());
  assert.deepEqual(r.diagnostics, []);
  assert.deepEqual(Object.keys(r.data), ["data/orders.csv", "data/cfg.json", "art/sheet.png"]);
  assert.deepEqual(r.data["data/orders.csv"], { path: "data/orders.csv", kind: "csv", from: "files.orders", text: "id,qty\n1,2\n" });
  assert.deepEqual(r.data["data/cfg.json"], { path: "data/cfg.json", kind: "json", from: "files.cfg", text: `{ "speed": 2 }`, value: { speed: 2 } });
  const img = r.data["art/sheet.png"];
  assert.equal(img.kind, "image");
  assert.equal(img.from, "images.sheet");
  assert.equal(img.width, 16);
  assert.equal(img.height, 8);
  assert.ok(img.bytes instanceof Uint8Array);
  // a text kind held as bytes is decoded
  const asBytes = await load(await files({ data: { ...DATA, "data/orders.csv": new TextEncoder().encode("id\n") } }));
  assert.equal(asBytes.data["data/orders.csv"].text, "id\n");
  // a Dialect that names none has none
  assert.deepEqual((await load(await files({ data: {} }), defs((d) => { delete d.images.sheet.file; delete d.files; }))).data, {});
});

test("K017: a data file the Dialect names that the manifest's files does not list", async () => {
  const { "data/cfg.json": _, ...rest } = DATA;
  const r = await load(await files({ data: rest }));
  assert.deepEqual(codes(r), ["K017"]);
  assert.match(r.diagnostics[0].message, /files\.cfg names data\/cfg\.json, which the package does not hold/);
  assert.equal(r.dialect, null, "on a diagnostic the loaded parts are null");
  const bad = await load(await files({ data: rest }), defs((d) => { d.files.cfg.path = "../cfg.json"; }));
  assert.deepEqual(codes(bad), ["K017"]);
  assert.match(bad.diagnostics[0].message, /not a normalized relative path/);
});

test("K018: a data file that does not decode as its kind", async () => {
  const one = async (/** @type {string} */ path, /** @type {any} */ content) => load(await files({ data: { ...DATA, [path]: content } }));
  const notPng = await one("art/sheet.png", "not a picture");
  assert.deepEqual(codes(notPng), ["K018"]);
  assert.match(notPng.diagnostics[0].message, /images\.sheet's file art\/sheet\.png is not a PNG/);
  assert.deepEqual(codes(await one("art/sheet.png", new Uint8Array([1, 2, 3]))), ["K018"]);
  const json = await one("data/cfg.json", "{ speed: 2 }");
  assert.deepEqual(codes(json), ["K018"]);
  assert.match(json.diagnostics[0].message, /data\/cfg\.json is not JSON/);
  assert.deepEqual(codes(await one("data/orders.csv", new Uint8Array([0xff, 0xfe]))), ["K018"], "not UTF-8");
});

test("K019: a PNG whose pixel size is not the image's declared size", async () => {
  const r = await load(await files({ data: { ...DATA, "art/sheet.png": pngHeader(16, 16) } }));
  assert.deepEqual(codes(r), ["K019"]);
  assert.match(r.diagnostics[0].message, /art\/sheet\.png is 16 by 16 pixels; images\.sheet declares size \[16, 8\] \(cells of 8 by 8\)/);
  assert.equal(r.diagnostics[0].file, "art/sheet.png");
});

test("the data codes are documented", () => {
  for (const c of ["K017", "K018", "K019"]) assert.ok(PACKAGE_CODES[c]?.length > 0, c);
});
