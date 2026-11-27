// Where files come from: the query, a fetch served from the repo's folders, an uploaded folder and a bundle.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { readPackageDir } from "../../../../scripts/pkg/dir.js";
import { writeBundle } from "../../../package/index.js";
import { loadWorkbench } from "../load.js";
import { parseQuery, importedPackages, fetchPackage, fetchGlue, groupUpload, packageFromBundle, contentOf } from "../sources.js";

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

test("fetched packages and glue load as the folder does, with bytes for non-.js files", async () => {
  const names = ["maze", "particles", "arcade"];
  const got = await Promise.all(names.map((n) => fetchPackage(`http://host/${DRAW}/${n}`, fetchRepo)));
  assert.deepEqual(got.flatMap((g) => g.diagnostics), []);
  assert.deepEqual(got[0].files, readPackageDir(`${ROOT}${DRAW}/maze`));
  const g = await fetchGlue(`http://host/${DRAW}/workbench.js`, fetchRepo);
  assert.equal(g.glue?.path, "workbench.js");
  const w = await loadWorkbench({ packages: Object.fromEntries(got.map((x) => [x.label, x.files])), glue: /** @type {any} */ (g.glue) }, env);
  assert.deepEqual(w.diagnostics.filter((d) => d.severity === "error"), []);
  assert.ok(contentOf("a.png", new Uint8Array([137, 80]).buffer) instanceof Uint8Array);
  assert.equal(contentOf("a.js", new TextEncoder().encode("x").buffer), "x");
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
