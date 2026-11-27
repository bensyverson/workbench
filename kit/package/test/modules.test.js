// @ts-nocheck: the definitions here are minimal and cast loosely.
// The manifest's `modules` (project/2026-11-27-controls-draft.md, requirement 11 and "What retires"; build plan groups
// 53 and 54): every trusted module the UI names, its custom elements' and its actions', listed once (K015, K016);
// `elements` is refused with a tip that it was renamed; KIT_VERSION is 0.5, and a 0.4 package is K003.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defineDialect, defineGrammar, defineUI, exact, list, KIT_VERSION } from "../../define/index.js";
import { loadPackage, hashText } from "../index.js";

const dialect = defineDialect({
  name: "optics", numberType: "f64", spaces: { s: { pure: true } }, targets: { js: { accepts: "*", compare: exact() } },
  slots: { v: { params: [], returns: "f64", space: "s" } }, state: { t: "f64", rows: list("str", 4) }, text: (s) => String(s.t),
});
const grammar = defineGrammar(dialect, { root: "p", constructs: { p: { opens: [], slots: {} } } });
const ui = defineUI(grammar, { stage: { element: "optics-bench", module: "./optics-bench.js" }, actions: { save: { label: "Save", module: "./export.js", export: "save", gives: "file" }, again: { label: "Again", module: "./export.js", export: "again", gives: "edits" } } });
const MODULES = { "optics.dialect.js": { d: dialect }, "optics.grammar.js": { g: grammar }, "optics.ui.js": { u: ui } };
const SRC = {
  "optics.dialect.js": `import { defineDialect } from "kit/define";\n`,
  "optics.grammar.js": `import { defineGrammar } from "kit/define";\nimport "./optics.dialect.js";\n`,
  "optics.ui.js": `import { defineUI } from "kit/define";\nimport "./optics.grammar.js";\n`,
  "optics-bench.js": `customElements.define("optics-bench", class extends HTMLElement {});\n`,
  "export.js": `export function save() {}\nexport function again() {}\n`,
};
async function files(over = {}) {
  const hashes = {};
  for (const [p, t] of Object.entries(SRC)) hashes[p] = await hashText(t);
  const manifest = { name: "optics", version: "0.1.0", kit: KIT_VERSION, entry: { dialect: "optics.dialect.js", grammar: "optics.grammar.js", ui: "optics.ui.js" }, files: hashes, ...over };
  return { ...SRC, "wb-package.json": JSON.stringify(manifest) };
}
const load = async (f) => loadPackage(f, { importModule: async (p) => MODULES[p], kitVersion: KIT_VERSION });
const codes = (r) => r.diagnostics.map((d) => d.code);

test("53. modules lists the element and action modules (K015, K016); elements is K002 with the tip that it was renamed", async () => {
  assert.deepEqual((await load(await files({ modules: ["export.js", "optics-bench.js"] }))).diagnostics, []);
  const missing = await load(await files({ modules: ["optics-bench.js"] }));
  assert.deepEqual(codes(missing), ["K015"]);
  assert.match(missing.diagnostics[0].message, /export\.js/);
  const extra = await load(await files({ modules: ["export.js", "optics-bench.js", "optics.ui.js"] }));
  assert.ok(codes(extra).includes("K016"));
  const old = await load(await files({ elements: ["optics-bench.js"], modules: ["export.js", "optics-bench.js"] }));
  assert.deepEqual(codes(old), ["K002"]);
  assert.match(old.diagnostics[0].fix, /renamed modules/);
});

test("54. KIT_VERSION is 0.5, and a package written for 0.4 is K003", async () => {
  assert.equal(KIT_VERSION, "0.5");
  const r = await load(await files({ kit: "0.4", modules: ["export.js", "optics-bench.js"] }));
  assert.deepEqual(codes(r), ["K003"]);
});
