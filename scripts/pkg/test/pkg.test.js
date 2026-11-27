// scripts/pkg/hash.js and bundle.js, driven as binaries against a temp copy of a package folder.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, realpathSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { hashText, readBundle, checkManifest } from "../../../kit/package/index.js";

const HASH = fileURLToPath(new URL("../hash.js", import.meta.url));
const BUNDLE = fileURLToPath(new URL("../bundle.js", import.meta.url));
const scratch = realpathSync(mkdtempSync(join(tmpdir(), "GZby9I-pkg-")));

/** A package folder with a stale manifest, a dotfile and a nested file. @param {string} name */
function folder(name) {
  const dir = join(scratch, name);
  mkdirSync(join(dir, "lib"), { recursive: true });
  mkdirSync(join(dir, ".hidden"));
  writeFileSync(join(dir, "x.dialect.js"), "export const a = 1;\n");
  writeFileSync(join(dir, "lib/n.js"), "export const n = 1;\n");
  writeFileSync(join(dir, ".DS_Store"), "junk");
  writeFileSync(join(dir, ".hidden/z.js"), "junk");
  writeFileSync(join(dir, "wb-package.json"), JSON.stringify({ name: "x", version: "0.1.0", kit: "0.4", entry: { dialect: "x.dialect.js", grammar: "lib/n.js" }, files: { "stale.js": "sha256-old" } }));
  return dir;
}
const run = (/** @type {string} */ script, /** @type {string[]} */ args) => spawnSync("node", [script, ...args], { encoding: "utf8" });

test("hash.js rewrites files: every file but the manifest and dotfiles, sorted, with real hashes", async () => {
  const dir = folder("h1");
  const r = run(HASH, [dir]);
  assert.equal(r.status, 0, r.stderr);
  const text = readFileSync(join(dir, "wb-package.json"), "utf8");
  const m = JSON.parse(text);
  assert.deepEqual(Object.keys(m.files), ["lib/n.js", "x.dialect.js"]);
  assert.equal(m.files["x.dialect.js"], await hashText("export const a = 1;\n"));
  assert.deepEqual(Object.keys(m).slice(0, 5), ["name", "version", "kit", "entry", "files"], "other fields keep their order");
  assert.ok(text.endsWith("}\n"));
  assert.deepEqual(checkManifest(text).diagnostics, []);
  assert.match(r.stdout, /2 files/);
});

test("hash.js is idempotent", () => {
  const dir = folder("h2");
  run(HASH, [dir]);
  const once = readFileSync(join(dir, "wb-package.json"), "utf8");
  assert.equal(run(HASH, [dir]).status, 0);
  assert.equal(readFileSync(join(dir, "wb-package.json"), "utf8"), once);
});

test("hash.js: no directory, or no manifest, is exit 4 with a remedy; a bad invocation is exit 2", () => {
  assert.equal(run(HASH, []).status, 2);
  assert.equal(run(HASH, ["a", "b"]).status, 2);
  const missing = run(HASH, [join(scratch, "nope")]);
  assert.equal(missing.status, 4);
  assert.match(missing.stderr, /nope/);
  mkdirSync(join(scratch, "empty"));
  const nomanifest = run(HASH, [join(scratch, "empty")]);
  assert.equal(nomanifest.status, 4);
  assert.match(nomanifest.stderr, /wb-package\.json/);
  const dir = folder("h3");
  writeFileSync(join(dir, "wb-package.json"), "{");
  const bad = run(HASH, [dir]);
  assert.equal(bad.status, 4);
  assert.match(bad.stderr, /JSON/);
  assert.equal(readFileSync(join(dir, "wb-package.json"), "utf8"), "{", "a bad manifest is left alone");
});

test("hash.js --help works with no directory", () => {
  const r = run(HASH, ["--help"]);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /usage/);
});

test("bundle.js writes the folder, manifest included and dotfiles not, as a bundle that reads back", () => {
  const dir = folder("b1");
  run(HASH, [dir]);
  const r = run(BUNDLE, [dir]);
  assert.equal(r.status, 0, r.stderr);
  const b = readBundle(r.stdout);
  assert.deepEqual(b.diagnostics, []);
  assert.deepEqual(Object.keys(b.files ?? {}), ["lib/n.js", "wb-package.json", "x.dialect.js"]);
  assert.equal(b.files?.["x.dialect.js"], "export const a = 1;\n");
});

test("a binary file (one that is not UTF-8, such as a PNG) is hashed as bytes and bundled as base64", async () => {
  const dir = folder("b2");
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0x00]);
  writeFileSync(join(dir, "sheet.png"), png);
  assert.equal(run(HASH, [dir]).status, 0);
  assert.equal(JSON.parse(readFileSync(join(dir, "wb-package.json"), "utf8")).files["sheet.png"], await hashText(png));
  const r = run(BUNDLE, [dir]);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(Object.keys(JSON.parse(r.stdout).files["sheet.png"]), ["base64"]);
  const b = readBundle(r.stdout);
  assert.ok(b.files?.["sheet.png"] instanceof Uint8Array);
  assert.deepEqual([.../** @type {Uint8Array} */ (b.files?.["sheet.png"])], [...png]);
  assert.equal(b.files?.["x.dialect.js"], "export const a = 1;\n", "a text file is still text");
});

test("bundle.js: no directory is exit 4, a bad invocation exit 2", () => {
  assert.equal(run(BUNDLE, []).status, 2);
  const r = run(BUNDLE, [join(scratch, "nope")]);
  assert.equal(r.status, 4);
  assert.match(r.stderr, /nope/);
});

test("a file with a UTF-8 BOM keeps its three bytes from folder to bundle, and hashes as its bytes", async () => {
  const dir = folder("bom");
  const raw = new Uint8Array([0xef, 0xbb, 0xbf, 0x61, 0x62, 0x63]);
  writeFileSync(join(dir, "lib/words.txt"), raw);
  assert.equal(run(HASH, [dir]).status, 0);
  const m = JSON.parse(readFileSync(join(dir, "wb-package.json"), "utf8"));
  assert.equal(m.files["lib/words.txt"], await hashText(raw));
  const r = run(BUNDLE, [dir]);
  assert.equal(r.status, 0, r.stderr);
  const back = readBundle(r.stdout).files?.["lib/words.txt"] ?? "";
  assert.deepEqual([...(typeof back === "string" ? new TextEncoder().encode(back) : back)], [...raw]);
});

test("cleanup",() => { rmSync(scratch, { recursive: true, force: true }); });
