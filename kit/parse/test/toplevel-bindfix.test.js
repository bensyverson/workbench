// Review of c7ed99f (job tIbqDV), findings M1 and L6, from the reviewer's probes
// local/rev-bind-probes/{helpers,blank}.probe.js. A helper's initializer text must be what String(fn) gives for
// the arrow its declaration writes (the Definition API's B012 compares the two), whatever comments, wrapping
// parens or missing `;` surround it; and a `/` after a postfix `++` or a keyword used as a property name is a
// division, not the start of a regex.
import { test } from "node:test";
import assert from "node:assert/strict";
import { topLevelBindings, topLevelNames, ScanError } from "../toplevel.js";

/** Declarations of `f`, each a real module: the scanner's init must equal String(f) as the engine gives it. */
const HELPERS = {
  plain: "const f = (x) => x * 2;\nexport default f;",
  noSemi: "const f = (x) => x * 2\nexport default f",
  trailingCommentNoSemi: "const f = (x) => x * 2 // double it\nexport default f",
  trailingBlockCommentNoSemi: "const f = (x) => x * 2 /* double it */\nexport default f",
  trailingCommentSemi: "const f = (x) => x * 2; // double it\nexport default f;",
  commentInside: "const f = (x) => /* scale */ x * 2;\nexport default f;",
  commentBeforeArrow: "const f = /* doc */ (x) => x * 2;\nexport default f;",
  lineCommentBeforeArrow: "const f = // doc\n  (x) => x * 2;\nexport default f;",
  parenthesized: "const f = ((x) => x * 2);\nexport default f;",
  doublyParenthesized: "const f = ( /* a */ ((x) => x * 2) );\nexport default f;",
  exportConst: "export const f = (x) => x * 2;\nexport default f;",
  crlf: "const f = (x) =>\r\n  x * 2;\r\nexport default f;\r\n",
  crlfNoSemi: "const f = (x) =>\r\n  x * 2\r\nexport default f\r\n",
  multiLine: "const f = (x) => {\n  const y = x * 2;\n  return y;\n};\nexport default f;",
  multiLineNoSemi: "const f = (x) => {\n  return x * 2\n}\nexport default f",
  twoDecls: "const g = 1, f = (x) => x * g;\nexport default f;",
  templ: "const f = (x) => `${x}}`.length;\nexport default f;",
  regexBody: "const f = (s) => /a\\/b/.test(s) ? 1 : 2;\nexport default f;",
  divComment: "const f = (y) => y / 2 // half\nexport default f",
  asyncArrow: "const f = async (x) => x;\nexport default f;",
  bareParam: "const f = x => x * 2;\nexport default f;",
};

test("a top-level helper's init is String(fn) of the arrow its declaration writes, around comments, parens and a missing ;", async () => {
  const wrong = [];
  for (const [label, code] of Object.entries(HELPERS)) {
    const mod = await import(`data:text/javascript,${encodeURIComponent(code)}`);
    const init = topLevelBindings(code).find((b) => b.name === "f")?.init;
    if (init !== String(mod.default)) wrong.push(`${label}: init ${JSON.stringify(init)}, String(fn) ${JSON.stringify(String(mod.default))}`);
  }
  assert.deepEqual(wrong, []);
});

test("parens that do not wrap the whole initializer stay", () => {
  assert.deepEqual(topLevelBindings("const A = (1 + 2) * (3);\nconst B = (a) => (a);\n").map((b) => b.init), ["(1 + 2) * (3)", "(a) => (a)"]);
});

test("a constant's init ends at its last character of code, before a trailing comment", () => {
  assert.equal(topLevelBindings("const A = y / 2 // c\nconst B = 1\n")[0].init, "y / 2");
});

test("a `/` after a postfix ++ is a division, so the scan sees the declarations after it", () => {
  const src = "let i = 0; i++ / 2; const Q = '/'; const B = 1;\n";
  assert.deepEqual(topLevelNames(src), ["i", "Q", "B"]);
  assert.deepEqual(topLevelNames("let j = 0; j-- / 2; const R = '/'; const C = 1;\n"), ["j", "R", "C"]);
});

test("a `/` after a keyword used as a property name is a division; after the keyword itself it still starts a regex", () => {
  assert.deepEqual(topLevelNames("const A = { typeof: 1 }.typeof / 2; const C = '/'; const B = 1;\n"), ["A", "C", "B"]);
  assert.deepEqual(topLevelNames("const A = o.return / 2; const C = '/'; const B = 1;\n"), ["A", "C", "B"]);
  // acorn 8.19 reads the `/` after `?.` and a keyword-named property as a regex (V8 as division): the file is refused
  assert.throws(() => topLevelNames("const A = o?.return / 2; const C = '/'; const B = 1;\n"), ScanError);
  assert.deepEqual(topLevelNames("const f = (s) => { return /}/.test(s); };\nconst B = 1;\n"), ["f", "B"]);
});
