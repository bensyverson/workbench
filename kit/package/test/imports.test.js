import { test } from "node:test";
import assert from "node:assert/strict";
import { scanImports } from "../index.js";

const FILES = new Set(["a.js", "lib/b.js", "lib/c.js", "d/e.js"]);
/** @param {string} path @param {string} text */
const scan = (path, text) => scanImports(path, text, FILES);
const codes = (/** @type {string} */ path, /** @type {string} */ text) => scan(path, text).diagnostics.map((d) => d.code);

test("kit/define and own files are allowed, and resolved", () => {
  const r = scan("a.js", `import { defineDialect } from "kit/define";\nimport b from './lib/b.js';\nimport "./lib/c.js";\nexport * from "./lib/b.js";\nexport { x } from "./lib/c.js";\nexport * as ns from "./lib/c.js";\nimport * as q from "./d/e.js";\nimport d, { e as f } from "./d/e.js";\n`);
  assert.deepEqual(r.diagnostics, []);
  assert.deepEqual(r.imports.map((i) => i.resolved), ["kit/define", "lib/b.js", "lib/c.js", "lib/b.js", "lib/c.js", "lib/c.js", "d/e.js", "d/e.js"]);
  assert.deepEqual(r.imports.map((i) => i.line), [1, 2, 3, 4, 5, 6, 7, 8]);
});

test("a relative specifier resolves against the importing file's folder, including ..", () => {
  assert.deepEqual(scan("lib/b.js", `import "./c.js"; import "../a.js"; import "../d/e.js";`).diagnostics, []);
  assert.deepEqual(scan("d/e.js", `import "../lib/b.js";`).diagnostics, []);
});

test("multi-line import clauses are found", () => {
  const r = scan("a.js", `import {\n  one,\n  two,\n} from\n  "./lib/b.js";\n`);
  assert.deepEqual(r.diagnostics, []);
  assert.equal(r.imports.length, 1);
  assert.equal(r.imports[0].line, 1);
});

test("a bare specifier, a built-in, a URL and an absolute path are K007", () => {
  for (const s of ["lodash", "node:fs", "fs", "https://x.test/a.js", "/abs.js", "kit/define/x", "kit", "data:text/javascript,1", "other-package"]) {
    assert.deepEqual(codes("a.js", `import x from "${s}";`), ["K007"], s);
  }
});

test("a relative specifier to a missing file, or one that leaves the package, is K007", () => {
  assert.deepEqual(codes("a.js", `import "./nope.js";`), ["K007"]);
  assert.deepEqual(codes("a.js", `import "./lib";`), ["K007"]);
  assert.deepEqual(codes("a.js", `import "../outside.js";`), ["K007"]);
  assert.deepEqual(codes("lib/b.js", `import "../../x.js";`), ["K007"]);
});

test("a dynamic import() is always K007, even of an allowed file", () => {
  assert.deepEqual(codes("a.js", `const m = await import("./lib/b.js");`), ["K007"]);
  assert.deepEqual(codes("a.js", `const m = import(name);`), ["K007"]);
  assert.deepEqual(codes("a.js", `x\n.import ( "y" )`), []);
});

test("each diagnostic names the file and line and has a fix", () => {
  const r = scan("lib/b.js", `// c\nimport x from "lodash";\n`);
  assert.equal(r.diagnostics[0].file, "lib/b.js");
  assert.equal(r.diagnostics[0].line, 2);
  assert.match(r.diagnostics[0].message, /lodash/);
  assert.ok(r.diagnostics[0].fix);
});

test("specifiers in comments and strings are not imports", () => {
  const text = [
    `// import x from "lodash";`,
    `/* import y from "node:fs";\n import("z"); */`,
    `const s = 'import x from "lodash"';`,
    "const t = `import(\"q\") export * from \"w\"`;",
    `const r = /import "x"/;`,
    `export const a = 1;`,
    `const o = { import: 1 }; o.import; `,
  ].join("\n");
  assert.deepEqual(scan("a.js", text).diagnostics, []);
  assert.deepEqual(scan("a.js", text).imports, []);
});

test("an export without from is not an import, and a later `from` does not fool the scan", () => {
  const text = `export const a = 1\nexport { a as b }\nconst from = "x"\nexport default a\n`;
  assert.deepEqual(scan("a.js", text).imports, []);
});

test("import.meta is not an import", () => {
  assert.deepEqual(scan("a.js", `const u = import.meta.url;`).diagnostics, []);
});

test("the offsets of each specifier locate it in the text", () => {
  const text = `import a from "./lib/b.js";\nimport k from 'kit/define';\n`;
  for (const i of scan("a.js", text).imports) assert.equal(text.slice(i.start, i.end), i.specifier);
});
