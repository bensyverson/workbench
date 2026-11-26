// module.js's `blank`: comments, strings, regexes and template text become spaces in place, so code and brackets stay
// at their own offsets. It reads a module with its syntax tree, and other text (a method's source) token by token.
import { test } from "node:test";
import assert from "node:assert/strict";
import { blank } from "../module.js";

test("comments, string interiors and regex interiors are blanked, offsets and line breaks kept", () => {
  const src = "const a = 1; // c\nconst s = \"x;y\", r = /a}b/g; /* m\n */ const z = 'q';\n";
  const out = blank(src);
  assert.equal(out.length, src.length);
  assert.equal(out, "const a = 1;     \nconst s = \"   \", r = /   /g;     \n    const z = ' ';\n");
});

test("a template's text is blanked and its expressions stay code, with ${ as ` (` and the closing } as `)`", () => {
  assert.equal(blank("const t = `a ${ {b: 1}.b } c`;"), "const t = `   ( {b: 1}.b )  `;");
  assert.equal(blank("x = `${`${1}`}`;"), "x = ` (` (1)`)`;");
});

test("a `/` is a regex or division as JavaScript reads it", () => {
  assert.equal(blank("if (k) /\\}/.test(s);\nconst a = 8 / 2 / 4;"), "if (k) /  /.test(s);\nconst a = 8 / 2 / 4;");
  assert.equal(blank("const o = { n: 4 }.n / 2; const r = /{/;"), "const o = { n: 4 }.n / 2; const r = / /;");
});

test("text that is no module (a method's source, a fragment) is blanked as far as it tokenizes", () => {
  assert.equal(blank("m(a = \"(\", b) { return a; } // end"), "m(a = \" \", b) { return a; }       ");
  assert.equal(blank("x = 'a' + ; // c"), "x = ' ' + ;     ");
});
