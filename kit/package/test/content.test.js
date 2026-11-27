// @ts-nocheck: a foreign-realm value is typed loosely here.
// A file's content as text or bytes (kit/package/content.js): one file hashes the same whichever way it is held,
// a UTF-8 byte order mark is kept (never silently dropped), and bytes from another realm are still bytes.

import { test } from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { textOf, bytesOf, hashText, checkPackage, readBundle, writeBundle, readPngSize, loadPackage } from "../index.js";
import { validFiles } from "./helpers.js";
import { pngHeader } from "../fixtures/png.js";

const BOM = new Uint8Array([0xef, 0xbb, 0xbf, 0x61, 0x62, 0x63]); // BOM + "abc"

test("textOf keeps a UTF-8 byte order mark as U+FEFF, so the text's bytes are the file's bytes", () => {
  assert.equal(textOf(BOM), "﻿abc");
  assert.deepEqual(bytesOf(textOf(BOM)), BOM);
});

test("a file with a BOM hashes the same as text and as bytes", async () => {
  assert.equal(await hashText(textOf(BOM)), await hashText(BOM));
});

test("a bundle round trip keeps a BOM's three bytes", () => {
  const back = readBundle(writeBundle({ "data/words.txt": BOM })).files["data/words.txt"];
  assert.deepEqual(bytesOf(back), BOM);
});

test("a manifest and a module held as bytes with a BOM still check, hashed over the true bytes", async () => {
  const text = await validFiles();
  const withBom = (/** @type {string} */ s) => new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(s)]);
  const files = { ...text, "lib/noise.js": withBom(text["lib/noise.js"]) };
  const manifest = JSON.parse(text["wb-package.json"]);
  manifest.files["lib/noise.js"] = await hashText(files["lib/noise.js"]);
  files["wb-package.json"] = withBom(JSON.stringify(manifest));
  const r = await checkPackage(files, { kitVersion: "0.4" });
  assert.deepEqual(r.diagnostics.map((d) => d.code), []);
  assert.equal(r.manifest.name, "x");
});

test("bytes from another realm are bytes: textOf, bytesOf, hashText and readPngSize accept them", async () => {
  const foreign = runInNewContext("new Uint8Array([0xef, 0xbb, 0xbf, 0x61, 0x62, 0x63])");
  assert.ok(!(foreign instanceof Uint8Array), "the probe is really foreign");
  assert.equal(textOf(foreign), "﻿abc");
  assert.equal(bytesOf(foreign), foreign);
  assert.equal(await hashText(foreign), await hashText(BOM));
  const png = runInNewContext("new Uint8Array(33)");
  png.set(pngHeader(16, 8));
  assert.deepEqual(readPngSize(png), { width: 16, height: 8 });
  assert.equal(readPngSize({ length: 40 }), null, "an object that merely has a length is not bytes");
  assert.equal(readPngSize("abc"), null);
});
