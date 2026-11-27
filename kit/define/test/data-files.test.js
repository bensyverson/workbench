// A Dialect's data files (the package format draft's ruling of 2026-11-26, leaf hca0YM): `files` names each data
// file the Dialect reads by its package path, with a kind (text, json, csv), and an image's `file` is a file of
// kind image. defineDialect checks the shape (D034; J003 for an image's file) and `dataFiles(dialect)` lists them.

import { test } from "node:test";
import assert from "node:assert/strict";
import { defineDialect, dataFiles, DATA_KINDS, DEFINE_CODES, DefinitionError } from "../index.js";
import { drawnMazeDecl } from "../../draw/fixtures/draw-dialects.js";

/** @param {(d: Record<string, any>) => void} change */
function make(change) {
  const d = drawnMazeDecl();
  change(d);
  return defineDialect(/** @type {any} */ (d));
}
/** @param {(d: Record<string, any>) => void} change */
function refused(change) {
  try { make(change); return []; } catch (e) {
    assert.ok(e instanceof DefinitionError, String(e));
    return e.diagnostics.map((d) => ({ code: d.code, path: d.path.join("."), message: d.message, tip: d.tip }));
  }
}

test("the data kinds are text, json and csv for files, and image for an image's file", () => {
  assert.deepEqual(DATA_KINDS, ["text", "json", "csv", "image"]);
  assert.ok(DEFINE_CODES.D034.length > 0);
});

test("a Dialect's data files are its files entries and its images' files, each with its kind", () => {
  const dialect = make((d) => {
    d.files = { orders: { kind: "csv", path: "data/orders.csv", note: "one order a row" }, intro: { kind: "text", path: "data/intro.txt", note: "the opening text" } };
    d.images.sheet.file = "art/sheet.png";
  });
  assert.deepEqual(dataFiles(dialect), [
    { path: "data/orders.csv", kind: "csv", from: "files.orders" },
    { path: "data/intro.txt", kind: "text", from: "files.intro" },
    { path: "art/sheet.png", kind: "image", from: "images.sheet" },
  ]);
  // a Dialect without either reads none, and an image without a file is still a box with no pixels
  assert.deepEqual(dataFiles(make(() => {})), []);
});

test("D034: a malformed files declaration", () => {
  const one = (/** @type {unknown} */ files) => refused((d) => { d.files = files; });
  assert.deepEqual(one([]).map((d) => d.code), ["D034"]);
  assert.deepEqual(one({ orders: "data/orders.csv" }).map((d) => d.code), ["D034"]);
  const kind = one({ orders: { kind: "xml", path: "data/orders.xml", note: "n" } });
  assert.deepEqual(kind.map((d) => d.code), ["D034"]);
  assert.match(kind[0].message, /files\.orders\.kind is "xml"; a data file's kind is text, json or csv/);
  const image = one({ art: { kind: "image", path: "art/a.png", note: "n" } });
  assert.deepEqual(image.map((d) => d.code), ["D034"]);
  assert.match(image[0].tip, /images: \{ <image>: \{ size: \[<w>, <h>\], cell\?: \[<cw>, <ch>\], file: "<path>\.png", note \} \}/);
  assert.deepEqual(one({ src: { kind: "text", path: "lib/x.js", note: "n" } }).map((d) => d.code), ["D034"], "a module is not a data file");
  assert.deepEqual(one({ o: { kind: "csv", note: "n" } }).map((d) => d.code), ["D034"], "no path");
  assert.deepEqual(one({ o: { kind: "csv", path: "o.csv" } }).map((d) => d.code), ["D034"], "no note");
  const typo = one({ o: { kind: "csv", path: "o.csv", note: "n", pth: "x" } });
  assert.deepEqual(typo.map((d) => d.code), ["D034"]);
  assert.match(typo[0].message, /Did you mean 'path'\?/);
  // two names for one path is one file declared twice
  assert.deepEqual(one({ a: { kind: "csv", path: "o.csv", note: "n" }, b: { kind: "text", path: "o.csv", note: "n" } }).map((d) => d.code), ["D034"]);
});

test("J003: an image's file is a path to a PNG that is not a module", () => {
  const one = (/** @type {unknown} */ file) => refused((d) => { d.images.sheet.file = file; });
  assert.deepEqual(one(3).map((d) => d.code), ["J003"]);
  assert.deepEqual(one("art/sheet.js").map((d) => d.code), ["J003"]);
  assert.deepEqual(one("").map((d) => d.code), ["J003"]);
  // a file both a data file and an image's is declared twice
  assert.deepEqual(refused((d) => { d.images.sheet.file = "art/sheet.png"; d.files = { s: { kind: "text", path: "art/sheet.png", note: "n" } }; }).map((d) => d.code), ["D034"]);
});
