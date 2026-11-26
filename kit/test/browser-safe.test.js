// kit/ also runs in the page, so its modules may not import Node built-ins, nor
// anything outside kit/ (scripts/ imports Node). Tests may.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";

const KIT = fileURLToPath(new URL("..", import.meta.url));

/**
 * Every .js file under `dir`, skipping test and prerelease (slow test) directories.
 * @param {string} dir
 * @returns {string[]}
 */
function sources(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return e.name === "test" || e.name === "prerelease" ? [] : sources(p);
    return e.name.endsWith(".js") ? [p] : [];
  });
}

/**
 * Why the module at `file` with source `text` could not run in the page: one entry per bad import.
 * @param {string} source
 * @param {string} file  An absolute path under KIT.
 * @returns {string[]}
 */
function problems(source, file) {
  // JSDoc types such as {import("./x.js").T} load nothing at run time.
  const text = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  /** @type {string[]} */
  const out = [];
  if (/\brequire\s*\(/.test(text)) out.push("calls require()");
  if (/\bimport\s*\(/.test(text)) out.push("uses a dynamic import()");
  // Statements only: an import or export at the start of a line, possibly spanning lines up to its `from`.
  const specs = [
    ...[...text.matchAll(/^\s*(?:import|export)\b[^;"']*?\bfrom\s*["']([^"']+)["']/gm)].map((m) => m[1]),
    ...[...text.matchAll(/^\s*import\s*["']([^"']+)["']/gm)].map((m) => m[1]),
  ];
  for (const s of specs) {
    if (!/^\.\.?\//.test(s)) { out.push(`imports ${s}`); continue; }
    const target = resolve(dirname(file), s);
    if (!target.startsWith(KIT.endsWith(sep) ? KIT : KIT + sep)) out.push(`imports ${s}, outside kit/`);
  }
  return out;
}

test("the import check catches every way a module can reach Node or leave kit/", () => {
  const file = join(KIT, "lower", "index.js");
  for (const text of [
    `import "node:fs";`,
    `import { loadDmg } from "../../scripts/dmg-oracle/load.js";`,
    `const fs = await import("fs");`,
    `export { readFileSync } from"node:fs";`,
    `import { readFileSync } from "node:fs";`,
    `const fs = require("fs");`,
    `import x from "fs";`,
  ]) assert.notDeepEqual(problems(text, file), [], text);
  assert.deepEqual(problems(`import { a } from "./a.js";\nimport { b } from "../ir/index.js";\n/** @import { T } from "../ir/ir.js" */\n/** @type {import("./d.js").Q} */`, file), []);
});

test("no kit module imports a Node built-in or a module outside kit/", () => {
  const files = sources(KIT);
  assert.ok(files.some((f) => f.includes(join("emit", "js"))), "the scan reaches kit/emit/js");
  for (const f of files) assert.deepEqual(problems(readFileSync(f, "utf8"), f), [], relative(KIT, f));
});
