// kit/ also runs in the page, so its modules may not import Node built-ins. Tests may.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const KIT = fileURLToPath(new URL("..", import.meta.url));

/**
 * Every .js file under `dir`, skipping test directories.
 * @param {string} dir
 * @returns {string[]}
 */
function sources(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return e.name === "test" ? [] : sources(p);
    return e.name.endsWith(".js") ? [p] : [];
  });
}

test("no kit module imports a Node built-in", () => {
  const files = sources(KIT);
  assert.ok(files.some((f) => f.includes(join("emit", "js"))), "the scan reaches kit/emit/js");
  for (const f of files) {
    const text = readFileSync(f, "utf8");
    assert.doesNotMatch(text, /from\s+["']node:|require\(|import\(\s*["']node:/, relative(KIT, f));
    for (const m of text.matchAll(/from\s+["']([^"']+)["']/g)) assert.match(m[1], /^\.\.?\//, `${relative(KIT, f)} imports ${m[1]}`);
  }
});
