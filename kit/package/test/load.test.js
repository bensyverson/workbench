// @ts-nocheck: the definitions here are minimal and cast loosely.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defineDialect, defineGrammar, defineUI, exact, struct, list } from "../../define/index.js";
import { loadPackage, hashText, contentKey } from "../index.js";

/** A one-state Dialect, its Grammar, and a UI, as a package would define them. */
function defs(name) {
  const dialect = defineDialect({
    name, numberType: "f64", spaces: { s: { pure: true } }, targets: { js: { accepts: "*", compare: exact() } },
    slots: { v: { params: [], returns: "f64", space: "s" } }, state: { t: "f64", rows: list("str", 4), box: struct({ w: "f64" }) },
    text: (s) => String(s.t),
  });
  const grammar = defineGrammar(dialect, { root: "p", constructs: { p: { opens: [], slots: {} } } });
  const ui = defineUI(grammar, { tiles: {} });
  return { dialect, grammar, ui };
}

const A = defs("alpha");
const MODULES = {
  "alpha.dialect.js": { alphaDialect: A.dialect, BUILTIN: ["pos"] },
  "alpha.grammar.js": { alpha: A.grammar },
  "alpha.ui.js": { alphaUI: A.ui },
  "examples/01.js": { default: () => 1 },
};

const SRC = {
  "alpha.dialect.js": `import { defineDialect } from "kit/define";\n`,
  "alpha.grammar.js": `import { defineGrammar } from "kit/define";\nimport "./alpha.dialect.js";\n`,
  "alpha.ui.js": `import { defineUI } from "kit/define";\nimport "./alpha.grammar.js";\n`,
  "examples/01.js": `import "../alpha.grammar.js";\nexport default () => 1;\n`,
  "refusals/r01.js": `import "../alpha.grammar.js";\nexport default () => 2;\n`,
  "alpha-field.js": `customElements.define("alpha-field", class extends HTMLElement {});\n`,
  "alpha-pad.js": `customElements.define("alpha-pad", class extends HTMLElement {});\n`,
};
const UI_ELEMENTS = defineUI(A.grammar, { stage: { element: "alpha-field", module: "./alpha-field.js" }, tiles: {} });
async function files(over = {}, ui = true) {
  const src = ui ? SRC : Object.fromEntries(Object.entries(SRC).filter(([k]) => k !== "alpha.ui.js"));
  const hashes = {};
  for (const [p, t] of Object.entries(src)) hashes[p] = await hashText(t);
  const entry = { dialect: "alpha.dialect.js", grammar: "alpha.grammar.js", ...(ui ? { ui: "alpha.ui.js" } : {}) };
  const manifest = { name: "alpha", version: "1.2.3", kit: "0.4", description: "d", entry, examples: ["examples/01.js"], foreign: [{ module: "examples/01.js", targets: ["js"], why: "test" }], files: hashes, ...over };
  return { ...src, "wb-package.json": JSON.stringify(manifest) };
}
const importer = (modules = MODULES) => async (p) => { if (!(p in modules)) throw new Error(`cannot import ${p}`); return modules[p]; };
const load = async (f, modules, o = {}) => loadPackage(f, { importModule: importer(modules), kitVersion: "0.4", ...o });
const codes = (r) => r.diagnostics.map((d) => d.code);

test("a valid package loads: found by value, whatever the export names are", async () => {
  const r = await load(await files());
  assert.deepEqual(r.diagnostics, []);
  assert.equal(r.name, "alpha");
  assert.equal(r.version, "1.2.3");
  assert.equal(r.dialect, A.dialect);
  assert.equal(r.grammar, A.grammar);
  assert.equal(r.ui, A.ui);
  assert.match(r.content, /^sha256-/);
  assert.deepEqual(r.examples, ["examples/01.js"]);
  assert.deepEqual(r.foreign, [{ module: "examples/01.js", targets: ["js"], why: "test" }]);
});

test("the content key covers the files and the manifest text: the same package gives the same key, a changed manifest another", async () => {
  const a = await load(await files());
  assert.equal(a.content, (await load(await files())).content);
  assert.notEqual(a.content, (await load(await files({ version: "9.9.9" }))).content);
  assert.notEqual(a.content, (await load(await files({ description: "other" }))).content);
  const f = await files();
  const { files: hashes } = JSON.parse(f["wb-package.json"]);
  assert.equal(a.content, await contentKey(hashes, f["wb-package.json"]));
});

test("refusals come back as the manifest wrote them", async () => {
  const r = await load(await files({ refusals: [{ module: "refusals/r01.js", code: "L004" }] }));
  assert.deepEqual(r.diagnostics, []);
  assert.deepEqual(r.refusals, [{ module: "refusals/r01.js", code: "L004" }]);
  assert.deepEqual((await load(await files())).refusals, []);
});

test("the UI's custom element modules must be exactly the manifest's modules: one K code each way", async () => {
  const modules = { ...MODULES, "alpha.ui.js": { u: UI_ELEMENTS } };
  const ok = await load(await files({ modules: ["alpha-field.js"] }), modules);
  assert.deepEqual(ok.diagnostics, []);
  const missing = await load(await files(), modules);
  assert.deepEqual(codes(missing), ["K015"]);
  assert.match(missing.diagnostics[0].message, /alpha-field\.js/);
  assert.equal(missing.diagnostics[0].file, "wb-package.json");
  const extra = await load(await files({ modules: ["alpha-field.js", "alpha-pad.js"] }), modules);
  assert.deepEqual(codes(extra), ["K016"]);
  assert.match(extra.diagnostics[0].message, /alpha-pad\.js/);
  // a UI with no custom elements, or no UI at all, leaves nothing for modules to list
  assert.deepEqual(codes(await load(await files({ modules: ["alpha-pad.js"] }))), ["K016"]);
  assert.deepEqual(codes(await load(await files({ modules: ["alpha-pad.js"] }, false))), ["K016"]);
});

test("the modules check normalizes the UI's ./ paths and counts a module used twice once", async () => {
  const ui = defineUI(A.grammar, { stage: { element: "alpha-field", module: "./alpha-field.js" }, tiles: {} });
  const r = await load(await files({ modules: ["alpha-field.js"] }), { ...MODULES, "alpha.ui.js": { u: ui } });
  assert.deepEqual(r.diagnostics, []);
});

test("the ui entry is optional: ui is null", async () => {
  const r = await load(await files({}, false));
  assert.deepEqual(r.diagnostics, []);
  assert.equal(r.ui, null);
});

test("a check failure is returned and nothing is imported", async () => {
  let called = 0;
  const f = await files({ kit: "0.3" });
  const r = await loadPackage(f, { importModule: async () => { called++; return {}; }, kitVersion: "0.4" });
  assert.deepEqual(codes(r), ["K003"]);
  assert.equal(called, 0);
  assert.equal(r.dialect, null);
});

test("importModule is called with entry paths only, in order dialect, grammar, ui", async () => {
  const seen = [];
  await loadPackage(await files(), { importModule: async (p) => { seen.push(p); return MODULES[p]; }, kitVersion: "0.4" });
  assert.deepEqual(seen, ["alpha.dialect.js", "alpha.grammar.js", "alpha.ui.js"]);
});

test("an import that throws is K011, naming the file and the error", async () => {
  const { "alpha.grammar.js": _gone, ...without } = MODULES;
  const r = await load(await files(), without);
  assert.deepEqual(codes(r), ["K011"]);
  assert.equal(r.diagnostics[0].file, "alpha.grammar.js");
  assert.match(r.diagnostics[0].message, /cannot import/);
  assert.equal(r.dialect, null);
});

test("an entry with no definition of its kind is K008", async () => {
  const r = await load(await files(), { ...MODULES, "alpha.dialect.js": { BUILTIN: [] } });
  assert.ok(codes(r).includes("K008"));
  assert.match(r.diagnostics.find((d) => d.code === "K008").message, /defineDialect/);
});

test("an entry with two definitions of its kind is K008", async () => {
  const B = defs("beta");
  const r = await load(await files(), { ...MODULES, "alpha.grammar.js": { alpha: A.grammar, other: B.grammar } });
  assert.ok(codes(r).includes("K008"));
  assert.match(r.diagnostics.find((d) => d.code === "K008").message, /two|2/);
});

test("the same definition exported under two names counts once", async () => {
  const r = await load(await files(), { ...MODULES, "alpha.dialect.js": { alphaDialect: A.dialect, alias: A.dialect } });
  assert.deepEqual(r.diagnostics, []);
});

test("a look-alike is not a definition: a plain object is not a Dialect, a function is not a builder", async () => {
  const r = await load(await files(), { ...MODULES, "alpha.dialect.js": { d: { name: "alpha" } }, "alpha.grammar.js": { g: () => 1 }, "alpha.ui.js": { u: { package: "alpha" } } });
  assert.deepEqual(codes(r), ["K008", "K008", "K008"]);
});

test("the Dialect's name must equal the manifest's", async () => {
  const f = await files({ name: "gamma" });
  const r = await load(f);
  assert.deepEqual(codes(r), ["K008"]);
  assert.match(r.diagnostics[0].message, /alpha/);
  assert.match(r.diagnostics[0].message, /gamma/);
});

test("the Grammar must be built on the entry Dialect", async () => {
  const B = defs("alpha");
  const r = await load(await files(), { ...MODULES, "alpha.grammar.js": { alpha: B.grammar }, "alpha.ui.js": { u: B.ui } });
  assert.deepEqual(codes(r), ["K008"]);
  assert.match(r.diagnostics[0].message, /Grammar/);
});

test("the UI must be built on the entry Grammar", async () => {
  const B = defs("alpha");
  const r = await load(await files(), { ...MODULES, "alpha.ui.js": { u: B.ui } });
  assert.deepEqual(codes(r), ["K008"]);
  assert.match(r.diagnostics[0].message, /UI/);
});

test("after one entry fails to import the others are not tried: they would only repeat its error", async () => {
  const seen = [];
  const r = await loadPackage(await files(), { kitVersion: "0.4", importModule: async (p) => { seen.push(p); throw new Error("boom"); } });
  assert.deepEqual(codes(r), ["K011"]);
  assert.deepEqual(seen, ["alpha.dialect.js"]);
});
