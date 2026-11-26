// buildTimeShadows' method detection must fail closed (an extra name, a spurious B013) rather than open, and stay
// near-linear (issue kRYm3Y, review of 0cc0c95): a class field without `;` before a member key, a statement-word
// method in an object literal reached through an operator, a leading-dot numeric key.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTimeShadows } from "../toplevel.js";

const body = "{ return b().f((p) => K); }";
const wrap = (/** @type {string} */ members, /** @type {string} */ init = "") => `const K = 1;\nconst o = ${init}{ ${members} };\nexport default () => o;`;
const cls = (/** @type {string} */ members, head = "class B") => `const K = 1;\n${head} { ${members} }\nexport default () => new B();`;

const shadows = {
  "class field without ;, then a string key": cls(`x = 1\n  'm'(K) ${body}`),
  "class field without ;, then a numeric key": cls(`x = 1\n  0(K) ${body}`),
  "class field without ;, then a method named if": cls(`x = 1\n  if(K) ${body}`),
  "class field without ;, then a method named of": cls(`x = 1\n  of(K) ${body}`),
  "bare class field, then a string key": cls(`x\n  'm'(K) ${body}`),
  "class arrow field without ;, then a string key": cls(`f = () => 1\n  'm'(K) ${body}`),
  "class field without ;, then a computed key": cls(`x = 1;\n  ['m'](K) ${body}`),
  "if-key in an object after ||": wrap(`if(K) ${body}`, "d || "),
  "with-key in an object after &&": wrap(`with(K) ${body}`, "d && "),
  "for-key in an object after a spread": `const K = 1;\nconst o = { ...{ for(K) ${body} } };\nexport default () => o;`,
  "catch-key in an object after !": wrap(`catch(K) ${body}`, "!"),
  "while-key in a class extending a call with an object": cls(`while(K) ${body}`, "class B extends mix(A, { a: 1 })"),
  "if-key in an object inside a template": `const K = 1;\nconst t = \`\${ { if(K) ${body} } }\`;\nexport default () => t;`,
  "switch-key in an object after ?:": wrap(`switch(K) ${body}`, "c ? 0 : "),
  "leading-dot numeric key": wrap(`.5(K) ${body}`),
  "string key in an object on the next line": wrap(`a: 1,\n  'm'(K) ${body}`),
};
for (const [name, code] of Object.entries(shadows)) {
  test(`fail open: ${name} records the parameter as a shadow`, () => assert.deepEqual(buildTimeShadows(code), ["K"]));
}

const clean = {
  "if in the export's block body": "export default () => { if (K) { b().f((p) => p); } return b(); };",
  "for in a helper": "function g(xs) { for (K of xs) { xs.map((x) => x); } }\nexport default () => b();",
  "switch in an arrow body": "const g = () => { switch (K) { case 1: b((x) => x); } };\nexport default () => b();",
  "if in a case block": "const g = (v) => { switch (v) { case 1: { if (K) { b((x) => x); } } } };\nexport default () => b();",
  "if in a block after o.class": "const g = (o) => { if (o.class) { if (K) { b((x) => x); } } };\nexport default () => b();",
  "while in nested for blocks": "const g = (c) => { for (const x of c) { while (K) { b((y) => y); } } };\nexport default () => b();",
  "if after an else": "const g = (c) => { if (c) { c++; } else { if (K) { b((y) => y); } } };\nexport default () => b();",
  "if in a try block": "const g = (c) => { try { if (K) { b((y) => y); } } finally { c++; } };\nexport default () => b();",
  "if in a method body": "const o = { m(c) { if (K) { b((y) => y); } } };\nexport default () => b();",
  "if in a block after a statement without ;": "const g = (c) => { c++\n  if (K) { b((y) => y); } };\nexport default () => b();",
  "call of a subscript in a statement": "const g = (fs, c) => { fs[0](K); fs[c](K); if (c) { b((y) => y); } };\nexport default () => b();",
};
for (const [name, code] of Object.entries(clean)) {
  test(`fail closed, not loud: ${name} binds nothing`, () => assert.deepEqual(buildTimeShadows(`const K = 1;\n${code}`), []));
}

const ifs = (/** @type {number} */ n) => `const K = 1;\nexport default () => { let a = 0;\n${"  if (a) { a++; }\n".repeat(n)} return b(); };`;
const calls = (/** @type {number} */ n) => `const K = 1;\nexport default () => { const fs = [];\n${"  fs[0](a);\n  g(a);\n".repeat(n)} return b(); };`;
const best = (/** @type {string} */ code) => Math.min(...[0, 1, 2].map(() => { const t = performance.now(); buildTimeShadows(code); return performance.now() - t; }));

// Quadratic growth would make 4x the input cost about 16x; the bound of 10 leaves a wide margin for noise.
for (const [name, gen] of Object.entries({ "statement heads": ifs, "calls and subscripts": calls })) {
  test(`scan time grows near-linearly with ${name}`, () => {
    best(gen(500)); // warm up
    const small = best(gen(1500)), large = best(gen(6000));
    assert.ok(large < Math.max(small, 2) * 10, `1500: ${small.toFixed(1)} ms, 6000: ${large.toFixed(1)} ms`);
  });
}
