// Review of 613926f (job AtIcKn), finding 3, from the reviewer's probes
// local/rev-scope-probes/{toplevel,math}.probe.js: what the lexical scan got wrong.
import { test } from "node:test";
import assert from "node:assert/strict";
import { topLevelNames, topLevelBindings, buildTimeNames } from "../toplevel.js";

test("a regex literal holding a quote or slashes hides nothing after it", () => {
  const src = "const re = /'/;\nconst K = 2;\nconst half = (v) => v / 2;\nexport default p;\nconst Z = 'x';\n";
  assert.deepEqual(topLevelNames(src), ["re", "K", "half", "Z"]);
  assert.deepEqual(topLevelBindings(src).map((b) => b.name), ["re", "K", "half", "Z"]);
  assert.equal(topLevelBindings(src).find((b) => b.name === "half")?.init, "(v) => v / 2");
  assert.deepEqual(topLevelNames("const re = /\\/\\//g;\nconst K = 2;\n"), ["re", "K"]);
  assert.deepEqual(topLevelNames("const re = /[/']/;\nconst K = 2;\n"), ["re", "K"]);
  assert.deepEqual(buildTimeNames("const re = /'/;\nfunction f(a) { return a; }\n"), ["a"]);
});

test("division is not a regex", () => {
  const src = "const K = (a) / 2; const L = 'it\\'s';\nconst M = x / y / z;\nconst N = 1;\n";
  assert.deepEqual(topLevelNames(src), ["K", "L", "M", "N"]);
});

test("several declarations on one line are all listed, with their initializers", () => {
  const src = "const A = 1; const B = (x) => x * A; let C = 3;\n";
  assert.deepEqual(topLevelNames(src), ["A", "B", "C"]);
  assert.deepEqual(topLevelBindings(src).map((b) => [b.name, b.init]), [["A", "1"], ["B", "(x) => x * A"], ["C", "3"]]);
});

test("destructuring lists the names it binds: rest elements, renamed keys and defaulted names, not default values", () => {
  const src = "const { a = Math.PI, b: c, ...others } = obj;\nconst [x, , y = z, ...rest] = arr;\n";
  assert.deepEqual(topLevelNames(src), ["a", "c", "others", "x", "y", "rest"]);
});

test("an indented declaration at the top level is listed; a declaration at column 0 inside a block is not", () => {
  const src = "  const K = 2;\nif (x) {\nconst inner = 3;\n}\n";
  assert.deepEqual(topLevelNames(src), ["K"]);
  assert.deepEqual(buildTimeNames(src), ["inner"]);
  assert.deepEqual(topLevelBindings("  const K = 2\n  const J = K + 1\n").map((b) => [b.name, b.init]), [["K", "2"], ["J", "K + 1"]]);
});

test("a template literal's text is not code, but its expressions are", () => {
  assert.deepEqual(topLevelNames("const T = `\nconst FAKE = 1\n`;\nconst K = 2;\n"), ["T", "K"]);
  assert.deepEqual(topLevelNames("const T = `a ${ {b: 1}.b } c`;\nconst K = 2;\n"), ["T", "K"]);
  assert.deepEqual(topLevelBindings("const T = `x ${ `y ${1}` }`, U = 2;\n").map((b) => [b.name, b.init]), [["T", "`x ${ `y ${1}` }`"], ["U", "2"]]);
});

test("a class body's and a loop's declarations are not top-level", () => {
  assert.deepEqual(topLevelNames("class A {\n  m(q) { const inner = 1; }\n}\nconst K = 2;\n"), ["K"]);
  assert.deepEqual(topLevelNames("for (const cut of [5]) b.filter((row) => row.units > cut);\nfor (let i = 0; i < 3; i++) {}\n"), []);
});
