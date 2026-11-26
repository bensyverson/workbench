import { test } from "node:test";
import assert from "node:assert/strict";
import { rewriteSpecifiers } from "../index.js";

const KIT = "blob:kit";
/** Drives the generator the way a host does: creates a "blob" after each module, answers urlFor from them. */
function run(/** @type {Record<string, string>} */ files) {
  /** @type {Map<string, string>} */
  const urls = new Map();
  const r = rewriteSpecifiers(files, (p) => { const u = urls.get(p); if (!u) throw new Error(`no url for ${p} yet`); return u; }, KIT);
  /** @type {Array<{ path: string, text: string }>} */
  const out = [];
  for (const m of r.modules) { out.push(m); urls.set(m.path, `blob:${m.path}`); }
  return { ...r, out };
}

test("leaves come first; each text names its dependencies' URLs and the kit URL", () => {
  const { out, diagnostics } = run({
    "x.grammar.js": `import { defineGrammar } from "kit/define";\nimport { d } from "./x.dialect.js";\nexport const g = 1;\n`,
    "x.dialect.js": `import { defineDialect } from 'kit/define';\nimport { n } from "./lib/n.js";\nexport const d = 1;\n`,
    "lib/n.js": `export const n = 1;\n`,
  });
  assert.deepEqual(diagnostics, []);
  assert.deepEqual(out.map((m) => m.path), ["lib/n.js", "x.dialect.js", "x.grammar.js"]);
  assert.equal(out[0].text, `export const n = 1;\n`);
  assert.equal(out[1].text, `import { defineDialect } from 'blob:kit';\nimport { n } from "blob:lib/n.js";\nexport const d = 1;\n`);
  assert.equal(out[2].text, `import { defineGrammar } from "blob:kit";\nimport { d } from "blob:x.dialect.js";\nexport const g = 1;\n`);
});

test("a dependency used twice, and a diamond, appear once", () => {
  const { out } = run({
    "a.js": `import "./b.js"; import "./c.js"; export * from "./b.js";`,
    "b.js": `import "./d.js";`, "c.js": `import "./d.js";`, "d.js": `export {};`,
  });
  assert.deepEqual(out.map((m) => m.path), ["d.js", "b.js", "c.js", "a.js"]);
  assert.equal(out[3].text, `import "blob:b.js"; import "blob:c.js"; export * from "blob:b.js";`);
});

test("only .js files are produced; other files are left to the host", () => {
  const { out } = run({ "a.js": `export {};`, "README.md": "# x", "data.json": "{}" });
  assert.deepEqual(out.map((m) => m.path), ["a.js"]);
});

test("specifiers in comments and strings are untouched", () => {
  const { out } = run({ "b.js": `export {};`, "a.js": `// import "./b.js"\nconst s = "./b.js";\nimport "./b.js";\n` });
  assert.equal(out[1].text, `// import "./b.js"\nconst s = "./b.js";\nimport "blob:b.js";\n`);
});

test("an import cycle is K009 naming the cycle, and yields no modules", () => {
  const { out, diagnostics } = run({ "a.js": `import "./b.js";`, "b.js": `import "./c.js";`, "c.js": `import "./a.js";` });
  assert.deepEqual(diagnostics.map((d) => d.code), ["K009"]);
  assert.match(diagnostics[0].message, /a\.js/);
  assert.match(diagnostics[0].message, /c\.js/);
  assert.ok(diagnostics[0].fix);
  assert.deepEqual(out, []);
});

test("a self-import is a cycle", () => {
  assert.deepEqual(run({ "a.js": `import "./a.js";` }).diagnostics.map((d) => d.code), ["K009"]);
});

test("an import the package may not make is K007 and yields no modules", () => {
  const r = run({ "a.js": `import "lodash";` });
  assert.deepEqual(r.diagnostics.map((d) => d.code), ["K007"]);
  assert.deepEqual(r.out, []);
});

test("the order is deterministic: sorted by path among independent files", () => {
  const { out } = run({ "z.js": `export {};`, "a.js": `export {};`, "m.js": `export {};` });
  assert.deepEqual(out.map((m) => m.path), ["a.js", "m.js", "z.js"]);
});
