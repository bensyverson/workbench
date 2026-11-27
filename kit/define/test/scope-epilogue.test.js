// The module scope of a Program file, as one kit export (leaf dXp5WO): `withScope(text)` appends the epilogue that
// exports the file's top-level bindings, and `moduleScope(text, mod)` turns that export and the text into the
// BuildOptions `.build` takes. The define trial's checker and the page host both used their own copy.
import { test } from "node:test";
import assert from "node:assert/strict";
import { withScope, moduleScope, SCOPE_EXPORT, FUNCTIONS_EXPORT } from "../index.js";
import { ScanError } from "../../parse/toplevel.js";

/** @param {string} src */
const load = (src) => import(`data:text/javascript,${encodeURIComponent(src)}`);

test("the epilogue exports every top-level binding, keeps each line's number, and shadows none of them", async () => {
  const text = "export const o = 2;\nconst K = 3;\nconst __scope = 4;\nlet n = 5;\nfunction f() { return 1; }\nconst τ = 6.28;\n";
  const out = withScope(text);
  assert.equal(out.split("\n").slice(0, 6).join("\n").endsWith("const τ = 6.28;"), true);
  assert.equal(out.split("\n")[1], "const K = 3;", "every line of the file keeps its number");
  const m = await load(out);
  assert.equal(typeof m[SCOPE_EXPORT], "function");
  assert.equal(typeof m[FUNCTIONS_EXPORT], "function");
  const s = m[SCOPE_EXPORT]();
  assert.deepEqual(Object.keys(s), ["o", "K", "__scope", "n", "f", "τ"]);
  assert.equal(s.__scope, 4);
  assert.equal(m[FUNCTIONS_EXPORT]().f, s.f);
});

test("a file the scan cannot read comes back as it is, so the engine reports its own syntax error", () => {
  assert.equal(withScope("const a = ;\nconst"), "const a = ;\nconst");
});

test("moduleScope gives the build options: scope, sources, keywords and the build-time names", async () => {
  const text = "const k = 2;\nlet m = 3;\nconst half = (x) => x / k;\nfunction g(x) { return x; }\nexport default ($) => { const local = 1; return local; };\n";
  const options = /** @type {any} */ (moduleScope(text, await load(withScope(text))));
  assert.deepEqual(Object.keys(options).sort(), ["buildTime", "buildTimeBindings", "keywords", "scope", "shadowed", "sources"]);
  assert.deepEqual({ k: options.scope.k, m: options.scope.m }, { k: 2, m: 3 });
  assert.deepEqual(options.sources, { k: "2", half: "(x) => x / k", g: "function g(x) { return x; }" });
  assert.deepEqual(options.keywords, { k: "const", m: "let", half: "const", g: "function" });
  assert.ok(options.buildTime.includes("local"));
});

test("a function declaration reassigned before the epilogue reads it loses its source: its text no longer vouches", async () => {
  const text = "function g(x) { return x; }\ng = (x) => x * 2;\n";
  const options = /** @type {any} */ (moduleScope(text, await load(withScope(text))));
  assert.equal(Object.hasOwn(options.sources, "g"), false);
});

test("moduleScope of a module without the epilogue has an empty scope, and a name declared twice throws ScanError", () => {
  assert.deepEqual(moduleScope("const a = 1;\n", {}).scope, {});
  assert.throws(() => moduleScope("const a = 1;\nconst b = 2;\nconst a = (x) => x;\n", {}), ScanError);
});
