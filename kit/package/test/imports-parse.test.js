// The import scan is a parse: these are the reviewer's probe cases (rev-pkg1 open, rev-pkg2 imports, export,
// blank, frag, pkg), ported as assertions. Every text with `evil` in it must be refused; the rest must pass.
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkPackage, hashText, scanImports } from "../index.js";
import { SRC } from "./helpers.js";

const FILES = ["a.js", "b.js", "lib/b.js"];
const refused = (/** @type {string} */ text) => scanImports("a.js", text, FILES).diagnostics.length > 0;

/** Texts that import "evil" by some route, or do not parse: all refused. */
const EVIL = [
  'const a = [...import("evil")];', 'new import("evil")', '/* c */ import("evil")',
  'import: for(;;){ break import }\nimport("evil")', 'export {a as b,\n c} from "evil"', 'export * as ns from "evil"',
  'export { default } from "evil"', "export { a } from 'evil'", 'export { "a b" as c } from "evil"', 'export { "}" as c } from "evil"',
  'export * as default from "evil"', "import x from 'evil'", "import 'evil'", 'import x, * as y from "evil"',
  'import { "a;b" as c } from "evil"', 'import x from "evil" with { type: "json" }', 'import{a}from"evil"',
  'const s = "😀"; import("evil")', 'let a = 1 / 2; import("evil"); let b = 1 / 2', 'let a = b\n/ 2; import("evil"); let c = d / 2',
  'if (x) y = (a) / 2; import("evil"); z = (b) / 2', 'const o = {} / 2; import("evil"); / 2', 'const s = `${import("evil")}`',
  'const s = `a${`b${import("evil")}`}`', 'const s = `$ { } ${ 1 }`; import("evil")', 'const r = /[/]/; import("evil")',
  'const r = /"/; import("evil"); const q = "x"', "const r = /'/; import('evil'); const q = 'x'", 'a++ / 2; import("evil"); b++ / 2',
  'const f = () => {}\n/x/.test(y); import("evil")', 'const f = function(){} / 2; import("evil"); / 2', 'class A {} /x/; import("evil")',
  'this / 2; import("evil"); this / 2', 'let of = 4; of / 2; import("evil"); of / 2', 'x = {typeof: 1}.typeof / 2; import("evil"); / 2',
  'x.return / 2; import("evil"); x.return / 2', 'x.typeof / 2; import("evil"); x.typeof / 2', 'a = {return: 1}; b = a.return /2/ 1; import("evil")',
  'x = 1; <!-- import("evil")\n', 'x = 1\n--> import("evil")\n', '#!/usr/bin/env node\nimport("evil")',
  'class A { #import = 1; m() { return this.#import } }\nimport("evil")', 'const ímport = 1; import("evil")', 'const a‍import = 1; import("evil")',
  'import.meta.x; import("evil")', 'import.source("evil")', 'import.defer("evil")', 'import . source ("evil")', 'import /*x*/ . /*y*/ source("evil")',
  'const s = "a\\\nb"; import("evil")', "const s = 'abc\nimport('evil')", 'const s = "a"\r\nimport("evil")', 'export {a}\n\nfrom "evil"',
  'export {a} /* x */ from /* y */ "evil"', 'import x /* from "ok" */ from "evil"', 'import { from as x } from "evil"', 'import from from "evil"',
  'import * as from from "evil"', 'export const from = "ok"; import("evil")', 'export {a}; const s = "from \\"x\\""; import("evil")',
  'async function* f(){ yield import("evil") }', 'await import("evil")', 'void import("evil")', 'a = 1.\nimport("evil")', 'a = b...import("evil")',
  'f(...import("evil"))', 'x = {...import("evil")}', 'f(a, ...\nimport("evil"))', 'im\\u0070ort("evil")', '\\u0069mport("evil")',  'import\t ("evil")', 'import ("evil")', 'import﻿("evil")', 'export { a as "b" } from "evil"', 'import x from "./b.json"; evil',
  'import x from "./nob.js/../b.js/x.js"', 'import x from "kit/define/x.js"', 'import x from "Kit/define"', 'import x from "../a.js"', 'import x from " ./b.js"',
  'import fs from "node:fs"', 'import x from "data:text/javascript,1"', 'import x from "https://e.com/x.js"', 'import x from "./b.js?x"',
  'import x from "./b.js#x"', 'import x from "./%62.js"', 'import x from ".\\\\b.js"', 'import x from "./b.js\t"',
  'export * as "a b" from "evil";', "export * as 'ab' from 'evil';", 'export *\n as\n ns\n from\n "evil";', 'export * as ns/*c*/from "evil";',
  'export * as \\u0061 from "evil";', 'export * as π from "evil";', 'export * as $x from "evil";', 'export { a as "x" } from "evil";',
  'export type { a } from "evil";', 'import type { a } from "evil";', 'import defer * as ns from "evil";', 'import source x from "evil";',
  'import x from "evil" assert { type: "json" };', 'import {} from "evil"', 'import * as ns from "evil"', 'import x, {y} from "evil"',
  'import x, {y as "z"} from "evil"', 'import {a as b,} from "evil"',
  'a = class {} / 2; import("evil"); b = 1 / 2;', 'a = class {} / 2;\nimport x from "evil";\nb = 1 / 2;', 'class A {} /x/.test(a); import("evil")',
  'label: /"/.test(a); import("evil"); `${/"/.test(b)}`', 'a = 1.\nimport x from "evil"',
  'import.defer("node:fs")', 'import.source("node:fs")',
  'export const noise = class {} / 2; import("node:fs"); 1 / 2',
];

test("every probe text that imports something else, or does not parse, is refused", () => {
  for (const t of EVIL) assert.equal(refused(t), true, JSON.stringify(t));
});

test("a text that only looks like an import passes, including a method or getter named import", () => {
  for (const t of [
    "obj?.import(1); a.import; a.export", "const o = { import: 1, export: 2 }; o.import(1)", "class A { import() {} export() {} static import() {} }",
    "const o = { get import() { return 1 } }", "class A { import() {} }", "export default from", 'a = 0x1.\nimport("x")', 'a.im\\u0070ort("x")', "const u = import.meta.url; export const a = 1;",
    'import x from "./b.js"; import "kit/define"', 'const s = "import(\\"evil\\")"; // import("evil")\n/* import x from "evil" */',
    "x\n.import ( \"y\" )", 'a.\nimport\n("x")', 'a . import("fs")', 'a\n.import("fs")', 'a?.\nimport("fs")', "const t = `import(\"evil\")`;",
  ]) assert.deepEqual(scanImports("a.js", t, FILES).diagnostics, [], JSON.stringify(t));
});

test("a module that does not parse is K007 with the line of the error", () => {
  const r = scanImports("a.js", "const a = 1;\nconst = ;\n", FILES);
  assert.deepEqual(r.diagnostics.map((d) => [d.code, d.line]), [["K007", 2]]);
  assert.match(r.diagnostics[0].message, /parse/);
});

test("start and end are the specifier's offsets inside the quotes, and lines are 1-based", () => {
  const text = `// x\nimport a from './b.js';\nexport { q } from "./lib/b.js";\nexport * from "kit/define";\n`;
  const r = scanImports("a.js", text, FILES);
  assert.deepEqual(r.diagnostics, []);
  assert.deepEqual(r.imports.map((i) => [text.slice(i.start, i.end), i.line, i.resolved]), [["./b.js", 2, "b.js"], ["./lib/b.js", 3, "lib/b.js"], ["kit/define", 4, "kit/define"]]);
});

/** @param {Record<string, string>} extra @param {Record<string, unknown>} [over] */
async function mk(extra, over = {}) {
  const src = { ...SRC, ...extra };
  /** @type {Record<string, string>} */
  const hashes = {};
  for (const [p, t] of Object.entries(src)) if (!p.split("/").some((s) => s.startsWith("."))) hashes[p] = await hashText(t);
  const m = { name: "x", version: "0.1.0", kit: "0.4", entry: { dialect: "x.dialect.js", grammar: "x.grammar.js" }, lib: ["lib/noise.js"], examples: ["examples/01.js"], files: hashes, ...over };
  return checkPackage({ ...src, "wb-package.json": JSON.stringify(m) }, { kitVersion: "0.4" });
}

test("a package with unusual but legal modules passes", async () => {
  assert.deepEqual((await mk({})).diagnostics, []);
  assert.deepEqual((await mk({ "lib/a.b.js": "export const a=1", "lib/noise.js": 'import "./a.b.js"; export const noise = 1;' })).diagnostics, []);
});

test("an import that reaches a non-.js file through ?, # or % is refused, and so is a file named so", async () => {
  const data = 'import fs from "node:fs";';
  for (const [name, spec] of [["lib/data.mjs#.js", "./data.mjs#.js"], ["lib/data.mjs?.js", "./data.mjs?.js"], ["lib/x%2ejs", "./x%2ejs"]]) {
    const r = await mk({ "lib/data.mjs": data, [name]: "export const a=1", "lib/noise.js": `import "${spec}"; export const noise = 1;` });
    assert.ok(r.diagnostics.length > 0, name);
  }
});

test("a dotfile import, an unlisted dotfile, a dot directory and non-.js evil files are refused or never run", async () => {
  for (const extra of /** @type {Record<string, string>[]} */ ([
    { "lib/.h.js": "export const a=1", "lib/noise.js": 'import "./.h.js"; export const noise = 1;' },
    { "lib/noise.js": 'export const noise = 1.\nimport("node:fs")' },
    { "lib/noise.js": 'export const noise = class {} / 2; import("node:fs"); 1 / 2' },
    { "lib/noise.js": 'import "./M.JS"; export const noise = 1;', "lib/M.JS": 'import "node:fs"' },
    { "lib/noise.js": 'import "./e.txt"; export const noise = 1;', "lib/e.txt": 'import("node:fs")' },
    { "lib/noise.js": 'import "./m.mjs"; export const noise = 1;', "lib/m.mjs": 'import fs from "node:fs"; import("node:child_process");' },
  ])) assert.ok((await mk(extra)).diagnostics.length > 0, JSON.stringify(Object.keys(extra)));
});
