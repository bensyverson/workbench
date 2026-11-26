// Second review of the scanner: a big file scans fast, a top-level labeled block is a block, and a line starting with
// ++ or -- ends the statement before it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { topLevelNames, topLevelBindings, buildTimeNames } from "../toplevel.js";

test("a 150 KB file of function declarations scans in well under a second", () => {
  const src = Array.from({ length: 4000 }, (_, i) => `function f${i}(a) { return a + ${i}; }\n`).join("");
  const t = performance.now();
  buildTimeNames(src);
  const ms = performance.now() - t;
  assert.ok(ms < 1000, `buildTimeNames took ${ms.toFixed(0)} ms on ${src.length} bytes`);
});

test("function declaration or expression is still told apart, and for await still a head", () => {
  const code = "export default async function () {}\nconst a = function () {};\nfunction b() {}\nfor await (const x of y) /r/.test(x);\nconst z = (x) => x;\n";
  assert.deepEqual(topLevelBindings(code).map((b) => b.name), ["a", "z"]);
});

test("a labeled block's `}` is a block: a regex after it is a regex, and the helper after it is found", () => {
  const code = "l: {}\n/{/.test(s);\nconst z = (x) => x;\n";
  new Function(code); // legal JavaScript
  assert.deepEqual(topLevelNames(code), ["z"]);
  assert.deepEqual(topLevelBindings(code).map((b) => b.name), ["z"]);
});

test("a labeled block with a body, and one in a block, are blocks too", () => {
  const code = "a: { const q = 1; }\n/{/.test(s);\nconst z = (x) => x;\nfunction f() { l: {}\n/{/.test(s); }\nconst w = (x) => x;\n";
  new Function(code);
  assert.deepEqual(topLevelBindings(code).map((b) => b.name), ["z", "w"]);
});

test("a `{` after `:` that is not a label stays what it was: case, object literal, ternary", () => {
  const code = [
    "switch (v) { case 1: {} /{/.test(s); }",
    "const o = { a: {}, b: { c: {} } };",
    "const t = k ? {} : {};",
    "const u = (x) => x;",
    "",
  ].join("\n");
  assert.deepEqual(topLevelBindings(code).map((b) => b.name), ["o", "t", "u"]);
  // a division after an object literal's `}` stays division
  assert.deepEqual(topLevelBindings("const o = { a: {} } / 2 / 3;\nconst u = 1;\n").map((b) => b.name), ["o", "u"]);
});

test("a line starting with ++ or -- ends the statement before it (a restricted production)", () => {
  const code = "const f = (x) => x\n++y\nconst g = (x) => x\n--y\nconst h = (x) => x\n";
  new Function("y", code.replace(/const /g, "var "));
  assert.deepEqual(topLevelBindings(code).map((b) => [b.name, b.init]), [["f", "(x) => x"], ["g", "(x) => x"], ["h", "(x) => x"]]);
});

test("a line starting with ++ after an operator still continues", () => {
  assert.deepEqual(topLevelBindings("const a = 1 +\n++y;\n").map((b) => b.init), ["1 +\n++y"]);
});
