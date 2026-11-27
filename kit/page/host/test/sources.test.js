// Where files come from: the query, a fetch served from the repo's folders, an uploaded folder and a bundle.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { readPackageDir } from "../../../../scripts/pkg/dir.js";
import { writeBundle, textOf } from "../../../package/index.js";
import { hashText } from "../../../package/hash.js";
import { loadWorkbench } from "../load.js";
import { parseQuery, importedPackages, fetchPackage, fetchGlue, groupUpload, packageFromBundle, contentOf, glueOf } from "../sources.js";

const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const DRAW = "scripts/draw-trial/massaged/2026-11-26-compose";
const kit = (/** @type {string} */ p) => new URL(`../../../${p}`, import.meta.url).href;
/** @type {import("../load.js").LoadEnv} */
const env = {
  urls: { define: kit("define/index.js"), compose: kit("compose/index.js") },
  makeUrl: (text) => `data:text/javascript;base64,${Buffer.from(text).toString("base64")}`,
  importUrl: (url) => import(url),
};

/** A fetch over the repo's files, at http://host/<repo path>. @param {string} url */
async function fetchRepo(url) {
  const path = ROOT + new URL(url).pathname.slice(1);
  if (!existsSync(path)) return new Response("", { status: 404 });
  return new Response(readFileSync(path));
}

test("the query names the glue, the packages and a profile", () => {
  assert.deepEqual(parseQuery("?workbench=a/w.js&packages=a/x, a/y&profile=canvas"), { workbench: "a/w.js", packages: ["a/x", "a/y"], profile: "canvas", preset: null });
  assert.deepEqual(parseQuery(""), { workbench: null, packages: [], profile: null, preset: null });
});

test("the packages a glue imports are read from its imports", () => {
  assert.deepEqual(importedPackages(readFileSync(`${ROOT}${DRAW}/workbench.js`, "utf8")), ["maze", "particles", "arcade"]);
  assert.deepEqual(importedPackages("this is not a module {"), []);
});

test("fetched packages and glue load as the folder does, every file as its bytes", async () => {
  const names = ["maze", "particles", "arcade"];
  const got = await Promise.all(names.map((n) => fetchPackage(`http://host/${DRAW}/${n}`, fetchRepo)));
  assert.deepEqual(got.flatMap((g) => g.diagnostics), []);
  const dir = readPackageDir(`${ROOT}${DRAW}/maze`);
  assert.deepEqual(Object.keys(got[0].files).sort(), Object.keys(dir).sort());
  for (const [p, c] of Object.entries(dir)) assert.deepEqual(typeof c === "string" ? textOf(got[0].files[p]) : got[0].files[p], c, p);
  const g = await fetchGlue(`http://host/${DRAW}/workbench.js`, fetchRepo);
  assert.equal(g.glue?.path, "workbench.js");
  const w = await loadWorkbench({ packages: Object.fromEntries(got.map((x) => [x.label, x.files])), glue: /** @type {any} */ (g.glue) }, env);
  assert.deepEqual(w.diagnostics.filter((d) => d.severity === "error"), []);
  assert.ok(contentOf("a.png", new Uint8Array([137, 80]).buffer) instanceof Uint8Array);
  assert.ok(contentOf("a.js", new TextEncoder().encode("x").buffer) instanceof Uint8Array);
});

test("the host hands kit/package a file's bytes: a BOM is kept and bad UTF-8 is the kit's to refuse (review M4.3)", async () => {
  const bom = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode("export default 1;\n")]);
  const bad = new Uint8Array([...new TextEncoder().encode('export const s = "'), 0xff, ...new TextEncoder().encode('";\n')]);
  for (const bytes of [bom, bad]) {
    const held = contentOf("grammar.js", bytes.buffer.slice(0));
    assert.equal(await hashText(held), await hashText(bytes), "the hash is over the bytes as fetched");
  }
  assert.equal(textOf(contentOf("grammar.js", bad.buffer.slice(0))), null);
  // a glue's text, from its bytes: bad UTF-8 is a diagnostic, not replacement characters
  assert.equal(glueOf("w.js", bom).glue?.text, "\uFEFFexport default 1;\n");
  const g = glueOf("w.js", bad);
  assert.equal(g.glue, null);
  assert.match(g.diagnostics[0]?.message ?? "", /UTF-8/);
});

test("a manifest's paths are checked with the kit's path rule before any is fetched (review LOW)", async () => {
  const manifest = { name: "p", files: { "grammar.js": "x", "../../private/secret.js": "x", "/abs.js": "x", "https://elsewhere.example/x.js": "x", "//cdn.example/y.js": "x", "a/../../up.js": "x" } };
  /** @type {string[]} */
  const asked = [];
  const fetchFn = async (/** @type {string} */ url) => {
    asked.push(url);
    return new Response(url.endsWith("wb-package.json") ? JSON.stringify(manifest) : "export default 1;");
  };
  const r = await fetchPackage("https://host.example/bench/pkgs/p/", fetchFn);
  assert.deepEqual(asked, ["https://host.example/bench/pkgs/p/wb-package.json", "https://host.example/bench/pkgs/p/grammar.js"]);
  assert.deepEqual(Object.keys(r.files).sort(), ["grammar.js", "wb-package.json"]);
});

test("a file that cannot be fetched is a diagnostic naming its URL", async () => {
  const r = await fetchPackage(`http://host/${DRAW}/nothing`, fetchRepo);
  assert.equal(r.diagnostics[0]?.code, "LOAD");
  assert.match(r.diagnostics[0]?.message ?? "", /nothing\/wb-package\.json: HTTP 404/);
  const bad = await fetchGlue("http://host/nope.js", fetchRepo);
  assert.equal(bad.glue, null);
  assert.equal(bad.diagnostics[0]?.code, "LOAD");
});

test("an uploaded folder splits into packages and a glue", () => {
  const entries = ["maze", "particles", "arcade"].flatMap((n) => Object.entries(readPackageDir(`${ROOT}${DRAW}/${n}`)).map(([p, content]) => ({ path: `top/${n}/${p}`, content })));
  entries.push({ path: "top/workbench.js", content: readFileSync(`${ROOT}${DRAW}/workbench.js`, "utf8") }, { path: "top/.DS_Store", content: "x" });
  const g = groupUpload(entries);
  assert.deepEqual(Object.keys(g.packages).sort(), ["arcade", "maze", "particles"]);
  assert.ok("wb-package.json" in g.packages.maze);
  assert.equal(g.glue?.path, "workbench.js");
  assert.deepEqual(groupUpload([...entries, { path: "top/other.js", content: "" }]).glues.sort(), ["top/other.js", "top/workbench.js"]);
});

test("a bundle is one package, and a bad one is K010", async () => {
  const files = readPackageDir(`${ROOT}${DRAW}/particles`);
  const b = packageFromBundle(writeBundle(files));
  assert.equal(b.label, "particles");
  assert.deepEqual(b.files, files);
  assert.equal(packageFromBundle("{").diagnostics[0]?.code, "K010");
});
