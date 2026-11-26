import { test } from "node:test";
import assert from "node:assert/strict";
import { checkPackage, hashText } from "../index.js";
import { validFiles } from "./helpers.js";

const opts = { kitVersion: "0.4" };
const codesOf = async (/** @type {Record<string, string>} */ files, o = opts) => (await checkPackage(files, o)).diagnostics.map((d) => d.code);
/** Rewrites the manifest of a file map. @param {Record<string, string>} files @param {(m: any) => void} edit */
const editManifest = (files, edit) => { const m = JSON.parse(files["wb-package.json"]); edit(m); return { ...files, "wb-package.json": JSON.stringify(m) }; };

test("a valid package passes", async () => {
  const r = await checkPackage(await validFiles(), opts);
  assert.deepEqual(r.diagnostics, []);
  assert.equal(r.manifest?.name, "x");
});

test("no wb-package.json is K001", async () => {
  const files = await validFiles(); delete /** @type {any} */ (files)["wb-package.json"];
  const r = await checkPackage(files, opts);
  assert.deepEqual(r.diagnostics.map((d) => d.code), ["K001"]);
  assert.equal(r.manifest, null);
});

test("a manifest error is reported and stops the file checks", async () => {
  assert.deepEqual(await codesOf({ "wb-package.json": "{" }), ["K001"]);
});

test("a kit version other than the kit's is K003, naming both", async () => {
  const files = editManifest(await validFiles(), (m) => { m.kit = "0.3"; });
  const r = await checkPackage(files, opts);
  assert.deepEqual(r.diagnostics.map((d) => d.code), ["K003"]);
  assert.match(r.diagnostics[0].message, /0\.3/);
  assert.match(r.diagnostics[0].message, /0\.4/);
  assert.ok(r.diagnostics[0].fix);
  // pre-1.0: exact equality, so a newer package is refused too
  assert.deepEqual(await codesOf(editManifest(await validFiles(), (m) => { m.kit = "0.5"; })), ["K003"]);
});

test("a listed file that is not in the map is K004", async () => {
  const files = await validFiles(); delete /** @type {any} */ (files)["lib/noise.js"];
  const r = await checkPackage(files, opts);
  assert.deepEqual(r.diagnostics.map((d) => d.code), ["K004"]);
  assert.match(r.diagnostics[0].message, /lib\/noise\.js/);
});

test("a file in the map that is not listed is K005, wb-package.json excepted", async () => {
  const files = { ...(await validFiles()), "extra.js": "export {};\n" };
  const r = await checkPackage(files, opts);
  assert.deepEqual(r.diagnostics.map((d) => d.code), ["K005"]);
  assert.match(r.diagnostics[0].message, /extra\.js/);
});

test("a changed file is K006, naming the file", async () => {
  const files = { ...(await validFiles()), "lib/noise.js": "export const noise = 2;\n" };
  const r = await checkPackage(files, opts);
  assert.deepEqual(r.diagnostics.map((d) => d.code), ["K006"]);
  assert.equal(r.diagnostics[0].file, "lib/noise.js");
});

test("an import the package may not make is K007, in any .js file, with its line", async () => {
  const bad = `import fs from "node:fs";\nexport const noise = 1;\n`;
  const files = await validFiles();
  files["lib/noise.js"] = bad;
  const m = JSON.parse(files["wb-package.json"]); m.files["lib/noise.js"] = await hashText(bad);
  files["wb-package.json"] = JSON.stringify(m);
  const r = await checkPackage(files, opts);
  assert.deepEqual(r.diagnostics.map((d) => d.code), ["K007"]);
  assert.equal(r.diagnostics[0].file, "lib/noise.js");
  assert.equal(r.diagnostics[0].line, 1);
});

test("non-.js files are hashed but not scanned for imports", async () => {
  const text = `import "lodash"\n`;
  /** @type {Record<string, string>} */
  const files = { ...(await validFiles()), "README.md": text };
  const m = JSON.parse(files["wb-package.json"]); m.files["README.md"] = await hashText(text);
  files["wb-package.json"] = JSON.stringify(m);
  assert.deepEqual(await codesOf(files), []);
});

test("several problems are all reported", async () => {
  const files = editManifest({ ...(await validFiles()), "extra.js": "", "lib/noise.js": "changed" }, (m) => { m.kit = "9.9"; });
  const codes = await codesOf(files);
  assert.deepEqual([...new Set(codes)].sort(), ["K003", "K005", "K006"]);
});

test("a .js file importing a listed non-.js file is K007, and the file is never run unscanned", async () => {
  const payload = `import fs from "node:fs";\n`;
  const files = await validFiles();
  files["lib/noise.js"] = `import "../m.mjs";\nexport const noise = 1;\n`;
  files["m.mjs"] = payload;
  const m = JSON.parse(files["wb-package.json"]);
  m.files["lib/noise.js"] = await hashText(files["lib/noise.js"]);
  m.files["m.mjs"] = await hashText(payload);
  files["wb-package.json"] = JSON.stringify(m);
  const r = await checkPackage(files, opts);
  assert.deepEqual(r.diagnostics.map((d) => d.code), ["K007"]);
  assert.equal(r.diagnostics[0].file, "lib/noise.js");
  assert.match(r.diagnostics[0].message, /m\.mjs/);
});

test("an uppercase .JS import target is K007 too", async () => {
  const files = await validFiles();
  files["lib/noise.js"] = `import "./M.JS";\n`;
  files["lib/M.JS"] = `import "node:fs";\n`;
  const m = JSON.parse(files["wb-package.json"]);
  m.files["lib/noise.js"] = await hashText(files["lib/noise.js"]);
  m.files["lib/M.JS"] = await hashText(files["lib/M.JS"]);
  files["wb-package.json"] = JSON.stringify(m);
  assert.deepEqual(await codesOf(files), ["K007"]);
});

test("a path with a part starting with . is not part of the package: checkPackage ignores it", async () => {
  const files = { ...(await validFiles()), ".DS_Store": "junk", "lib/.hidden.js": `import "node:fs";`, ".git/config": "x", "a/.b/c.js": `import "node:fs";` };
  const r = await checkPackage(files, opts);
  assert.deepEqual(r.diagnostics, []);
});

test("a manifest that lists a dotfile is K002: it names a file no package holds", async () => {
  const files = await validFiles();
  const m = JSON.parse(files["wb-package.json"]);
  m.files[".DS_Store"] = await hashText("junk");
  files["wb-package.json"] = JSON.stringify(m);
  files[".DS_Store"] = "junk";
  const r = await checkPackage(files, opts);
  assert.deepEqual(r.diagnostics.map((d) => d.code), ["K002"]);
  assert.match(r.diagnostics[0].message, /\.DS_Store/);
});

test("K006's fix is for any host: no script path, and it says to get a fresh copy or rehash as the author", async () => {
  const files = { ...(await validFiles()), "lib/noise.js": "export const noise = 2;\n" };
  const r = await checkPackage(files, opts);
  assert.equal(r.diagnostics[0].code, "K006");
  assert.doesNotMatch(r.diagnostics[0].fix, /scripts\/|\.sh|node /);
  assert.match(r.diagnostics[0].fix, /fresh copy/);
  assert.match(r.diagnostics[0].fix, /rehash/);
});
