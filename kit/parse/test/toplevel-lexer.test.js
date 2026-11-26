// Review of 04567fb (jobs ZAV0oC, oFnhCN, UyAmvg, Smoofu), from the reviewer's probes
// local/rev-04567fb-probes/scanner.probe.js. Whether a `/` starts a regex depends on what the `)` or `}` before it
// closes (an `if`/`while`/`for`/`with` head, a block statement), names are Unicode, `of` is a keyword only in a
// `for` head, a line starting with a string or number literal ends the statement before it, brackets are matched
// by kind, and a name the scan finds declared twice at the top level (proof of a misread) is refused.
import { test } from "node:test";
import assert from "node:assert/strict";
import { topLevelBindings, topLevelNames, buildTimeNames, ScanError } from "../toplevel.js";

const TEXT = [
  "const k = 100;",
  "const f0 = mk(3);",
  "function mk(k) { if (k) /\\}/.test(\"\"); const f0 = (x) => x * k; return f0; }",
  "export default (u) => field(\"f\").pixel((uv) => color(f0(uv.x), 0, 0));",
  "",
].join("\n");

test("the scanner lists no const declared inside a function body after `if (k) /\\}/`", () => {
  assert.deepEqual(topLevelBindings(TEXT).map((b) => b.name), ["k", "f0"]);
  assert.equal(topLevelBindings(TEXT)[1].init, "mk(3)");
  assert.deepEqual(topLevelNames(TEXT), ["k", "f0", "mk"]);
});

test("a const inside a function after `while (k--) /\\)/.exec('')` is not top-level", () => {
  assert.deepEqual(topLevelBindings("function mk(k) { while (k--) /\\)/.exec(''); const h = (x) => x * k; return h }\nconst z = 1;\n").map((b) => b.name), ["z"]);
  assert.deepEqual(topLevelNames("for (;;) /\\{/.test(s);\nconst z = 1;\n"), ["z"]);
});

test("after a `)` that closes no statement head, a `/` is still division", () => {
  assert.deepEqual(topLevelNames("const a = (1 + 2) / 3, b = f(x) / 2; const c = '/'; const d = 1;\n"), ["a", "b", "c", "d"]);
  assert.deepEqual(topLevelNames("const a = o.if(x) / 2; const c = '/'; const d = 1;\n"), ["a", "c", "d"]);
});

test("a helper after `τ / 2,` or `x / of / 2,` is found", () => {
  assert.deepEqual(topLevelNames("const a = τ / 2, f = (x) => x / 3;\n"), ["a", "f"]);
  assert.deepEqual(topLevelBindings("const of = 2;\nconst a = 1 / of / 2, f = (x) => x / 3;\n").map((b) => b.name), ["of", "a", "f"]);
});

test("`of` in a for head is still a keyword: a regex after it is a regex", () => {
  assert.deepEqual(topLevelNames("for (const m of /a}/.exec(s)) n++;\nconst z = 1;\n"), ["z"]);
});

test("a non-ASCII name is a top-level name and a binding", () => {
  assert.deepEqual(topLevelNames("const τ = 6.28;\nlet φ = 1, { ü } = o;\nfunction ƒ() {}\n"), ["τ", "φ", "ü", "ƒ"]);
  assert.deepEqual(topLevelBindings("const τ = 6.28;\nconst half = (x) => x / τ;\n").map((b) => [b.name, b.init]), [["τ", "6.28"], ["half", "(x) => x / τ"]]);
  assert.deepEqual(buildTimeNames("const τ = 1;\nfunction f(ψ) { const ω = 2; }\n").sort(), ["ψ", "ω"]);
});

test("a helper after `if (q) {}\\n/\\{/.test(s);` is found: a regex may follow a block statement's `}`", () => {
  assert.deepEqual(topLevelNames("if (q) {}\n/\\{/.test(s);\nconst f = (x) => x;\n"), ["f"]);
  assert.deepEqual(topLevelNames("function g() {}\n/\\{/.test(s);\nconst f = (x) => x;\n"), ["g", "f"]);
  assert.deepEqual(topLevelNames("try {} finally {}\n/\\(/.test(s);\nconst f = 1;\n"), ["f"]);
});

test("after an object literal's or a function expression's `}`, a `/` is still division", () => {
  assert.deepEqual(topLevelNames("const a = { n: 4 }.n / 2; const c = '/'; const d = 1;\n"), ["a", "c", "d"]);
  assert.deepEqual(topLevelNames("const a = function () { return 4 }() / 2; const c = '/'; const d = 1;\n"), ["a", "c", "d"]);
  assert.deepEqual(topLevelNames("const T = `${ {b: 1}.b / 2 }`; const c = '/'; const d = 1;\n"), ["T", "c", "d"]);
});

test("an unterminated helper followed by a string- or number-literal statement keeps its own init", () => {
  assert.equal(topLevelBindings("const f = (x) => x + 1\n\"use strict\"\n")[0].init, "(x) => x + 1");
  assert.equal(topLevelBindings("const f = (x) => x + 1\n'a'.length\n")[0].init, "(x) => x + 1");
  assert.equal(topLevelBindings("const f = (x) => x + 1\n2 .toFixed()\n")[0].init, "(x) => x + 1");
});

test("a line starting with a template literal still continues the one before (a tagged template)", () => {
  assert.equal(topLevelBindings("const s = tag\n`a`\nconst z = 1\n")[0].init, "tag\n`a`");
});

test("a closer of another kind is a syntax error, so the file is refused", () => {
  assert.throws(() => topLevelNames("function mk(k) { const a = [1, 2)]; const b = 1; }\nconst z = 1;\n"), ScanError);
});

test("a name the scan finds declared twice at the top level is refused, not resolved to either declaration", () => {
  assert.throws(() => topLevelBindings("const a = 1;\nconst a = (x) => x;\n"), (e) => e instanceof ScanError && /'a'/.test(e.message) && /twice/.test(e.message));
  assert.throws(() => topLevelBindings("let a = 1;\nfunction a() {}\n"), ScanError);
  // `var` may declare one name again, a function declaration may not in a module
  assert.deepEqual(topLevelBindings("var v = 1; var v = 2;\nconst z = 1;\n").map((b) => b.name), ["z"]);
  assert.throws(() => topLevelBindings("function g() {} function g() {}\nconst z = 1;\n"), ScanError);
});
