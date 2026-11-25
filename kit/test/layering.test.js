// Layering ratchet: kit code outside kit/dialects/ must not import a Dialect. Today's offenders are listed
// below; the list may only shrink (a listed file that no longer imports a Dialect fails the test too).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const KIT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIALECTS = join(KIT, "dialects");

/** Files that import a Dialect today, relative to kit/. Remove an entry when its file stops. */
const ALLOWED = [
  "define/define.d.ts",
  "define/dialect.js",
  "harness/pipeline.js",
  "harness/target.js",
  "harness/cases.js",
  "debugger/trace.js",
  "debugger/pixel.js",
  "debugger/page/gl.js",
  "debugger/page/page.js",
];

/** Every module specifier a source mentions: `from "x"` (import, export, `@import`), `import("x")` and `import "x"`. */
export function specifiers(/** @type {string} */ source) {
  const found = [];
  const patterns = [/\bfrom\s*["']([^"']+)["']/g, /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g, /\bimport\s+["']([^"']+)["']/g];
  for (const re of patterns) for (const m of source.matchAll(re)) found.push(m[1]);
  return found;
}

/** The specifiers of `source` (a file at `file`) that resolve to somewhere under kit/dialects/. */
export function dialectSpecifiers(/** @type {string} */ source, /** @type {string} */ file) {
  return specifiers(source).filter((s) => {
    if (!s.startsWith(".")) return false;
    const target = resolve(dirname(file), s);
    return target === DIALECTS || target.startsWith(DIALECTS + sep);
  });
}

/** Product files: .js and .d.ts under kit/, outside kit/dialects/, test/ and prerelease/ folders. */
function productFiles(/** @type {string} */ dir) {
  /** @type {string[]} */
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (p === DIALECTS || e.name === "test" || e.name === "prerelease" || e.name === "node_modules") continue;
      out.push(...productFiles(p));
    } else if (e.name.endsWith(".js") || e.name.endsWith(".d.ts")) out.push(p);
  }
  return out;
}

test("the scanner sees every import form that reaches a Dialect", () => {
  const f = join(KIT, "x/y.js");
  const forms = [
    'import { a } from "../dialects/fields/index.js";',
    "export * from '../dialects/data/index.js';",
    'const m = await import("../dialects/dmg/index.js");',
    '/** @import { T } from "../dialects/fields/decls.js" */',
    '/** @type {import("../dialects/fields/decls.js").T} */',
    'import type { T } from "../dialects/fields/decls.js";',
    'import "../dialects/fields/side.js";',
  ];
  for (const src of forms) assert.equal(dialectSpecifiers(src, f).length, 1, src);
});

test("the scanner ignores imports that stay outside kit/dialects/", () => {
  const f = join(KIT, "x/y.js");
  for (const src of ['import { a } from "../ir/index.js";', 'import x from "node:fs";', 'import("./dialects/local.js")', '/** @import { T } from "../ir/dialects.js" */']) {
    assert.deepEqual(dialectSpecifiers(src, f), [], src);
  }
});

test("kit code outside kit/dialects/ imports no Dialect beyond the allow-list, and the list has no stale entry", () => {
  const importers = new Set();
  for (const file of productFiles(KIT)) {
    if (dialectSpecifiers(readFileSync(file, "utf8"), file).length) importers.add(relative(KIT, file).split(sep).join("/"));
  }
  const allowed = new Set(ALLOWED);
  const fresh = [...importers].filter((f) => !allowed.has(f)).sort();
  const stale = ALLOWED.filter((f) => !importers.has(f)).sort();
  assert.deepEqual(fresh, [], `new Dialect imports outside kit/dialects/ (move the dependency, do not extend the list): ${fresh.join(", ")}`);
  assert.deepEqual(stale, [], `allow-listed files that no longer import a Dialect (delete them from ALLOWED): ${stale.join(", ")}`);
});
