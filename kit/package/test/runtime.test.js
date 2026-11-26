// @ts-nocheck: the definitions here are minimal and cast loosely.
// entry.runtime: a package may name its runtime module, checked as entry.ui is (K002 for the path, K008 for what
// it exports: exactly one defineRuntime result, built on the package's Grammar).
import { test } from "node:test";
import assert from "node:assert/strict";
import { defineDialect, defineGrammar, defineRuntime, exact } from "../../define/index.js";
import { loadPackage, hashText } from "../index.js";

function defs(name) {
  const dialect = defineDialect({
    name, numberType: "f64", spaces: { s: { pure: true } }, targets: { js: { accepts: "*", compare: exact() } },
    slots: { v: { params: [], returns: "f64", space: "s" } }, state: { t: "f64" }, text: (s) => String(s.t),
  });
  const grammar = defineGrammar(dialect, { root: "p", constructs: { p: { opens: [], slots: {} } } });
  const runtime = defineRuntime(grammar, { clock: () => ({ tick: 1 / 8 }), init: () => ({ t: 0 }), step: (s, { dt }) => ({ t: s.t + dt }) });
  return { dialect, grammar, runtime };
}
const A = defs("alpha"), B = defs("beta");
const SRC = {
  "alpha.dialect.js": `import { defineDialect } from "kit/define";\n`,
  "alpha.grammar.js": `import { defineGrammar } from "kit/define";\nimport "./alpha.dialect.js";\n`,
  "alpha.runtime.js": `import { defineRuntime } from "kit/define";\nimport "./alpha.grammar.js";\n`,
};
async function files(entry = { runtime: "alpha.runtime.js" }) {
  const hashes = {};
  for (const [p, t] of Object.entries(SRC)) hashes[p] = await hashText(t);
  const manifest = { name: "alpha", version: "1.0.0", kit: "0.4", entry: { dialect: "alpha.dialect.js", grammar: "alpha.grammar.js", ...entry }, files: hashes };
  return { ...SRC, "wb-package.json": JSON.stringify(manifest) };
}
const modules = (runtimeModule) => ({ "alpha.dialect.js": { d: A.dialect }, "alpha.grammar.js": { alpha: A.grammar }, "alpha.runtime.js": runtimeModule });
const load = async (f, m) => loadPackage(f, { importModule: async (p) => { if (!(p in m)) throw new Error(`cannot import ${p}`); return m[p]; }, kitVersion: "0.4" });
const codes = (r) => r.diagnostics.map((d) => d.code);

test("a package with entry.runtime loads its one Runtime", async () => {
  const r = await load(await files(), modules({ alphaRuntime: A.runtime, HELPER: 1 }));
  assert.deepEqual(r.diagnostics, []);
  assert.equal(r.runtime, A.runtime);
});

test("entry.runtime is optional: runtime is null", async () => {
  const f = await files({});
  const r = await load(f, modules({}));
  assert.deepEqual(r.diagnostics, []);
  assert.equal(r.runtime, null);
});

test("K008: a runtime module with no Runtime, with two, or one built on another Grammar", async () => {
  assert.deepEqual(codes(await load(await files(), modules({ x: 1 }))), ["K008"]);
  assert.deepEqual(codes(await load(await files(), modules({ a: A.runtime, b: B.runtime }))), ["K008"]);
  const other = await load(await files(), modules({ b: B.runtime }));
  assert.deepEqual(codes(other), ["K008"]);
  assert.match(other.diagnostics[0].message, /Runtime in alpha\.runtime\.js is not built on the Grammar/);
});

test("K002: entry.runtime is a module path like the other entries", async () => {
  const r = await load(await files({ runtime: "alpha.runtime.ts" }), modules({ a: A.runtime }));
  assert.deepEqual(codes(r), ["K002"]);
  assert.match(r.diagnostics[0].message, /"entry\.runtime" is "alpha\.runtime\.ts"/);
});
