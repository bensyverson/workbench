// Fail-closed edges of the whole-file scan: a `/` acorn misreads after `?.keyword`, a very long operator chain, and
// the export's own parameter in buildTimeShadows.
import { test } from "node:test";
import assert from "node:assert/strict";
import { topLevelNames, topLevelBindings, buildTimeNames, buildTimeShadows, buildTimeBindings, topLevelRefs, ScanError } from "../toplevel.js";

const KEYWORDS = ["return", "in", "of", "default", "typeof", "new", "delete", "void", "case", "throw"];

for (const kw of KEYWORDS) {
  test(`a '/' after ?.${kw} that acorn reads as a regex is a ScanError, not a hidden declaration`, () => {
    const src = `const o = {};\nconst q = o?.${kw}\n/ 2; const hidden = () => 1; const z = 3 /\n1;\nexport default () => 1;`;
    assert.throws(() => topLevelNames(src), ScanError);
    assert.throws(() => topLevelBindings(src), ScanError);
  });
}

test("a division after a plain .keyword, and after ?.name, still scans", () => {
  assert.deepEqual(topLevelNames("const o = {};\nconst a = o.in / 2;\nconst b = o.in\n/ 2;\nconst c = o?.x\n/ 2 / 1;\nconst e = o?.class\n/ 2; const f = 1 /\n1;\nexport default () => 1;"), ["o", "a", "b", "c", "e", "f"]);
  assert.deepEqual(topLevelNames("const r = /a/.test(s) ? 1 : 2;\nconst o = {};\nconst d = o?.in?.[0];"), ["r", "o", "d"]);
  assert.deepEqual(topLevelNames("const o = {};\nconst g = o?.[/a/.source];\nconst h = o?.(/b/);"), ["o", "g", "h"]);
});

test("a very long operator chain is a ScanError from every entry point that walks the tree, not a RangeError", () => {
  const src = "const x = 1" + " + 1".repeat(5000) + ";\nexport default () => x;";
  assert.throws(() => topLevelNames(src), ScanError);
  assert.throws(() => buildTimeNames(src), ScanError);
  assert.throws(() => buildTimeShadows(src), ScanError);
  assert.throws(() => buildTimeBindings(src), ScanError);
});

test("a very long operator chain in a lambda's text is a ScanError from topLevelRefs", () => {
  const lambda = "() => 1" + " + 1".repeat(5000);
  assert.throws(() => topLevelRefs(lambda, ["x"]), ScanError);
});

test("the export's own parameter counts in buildTimeShadows only when the export holds a function", () => {
  assert.deepEqual(buildTimeShadows("const k = 1;\nexport default (k) => 1;"), []);
  assert.deepEqual(buildTimeShadows("const k = 1;\nexport default (k) => { [1].map((x) => x); return 1; };"), ["k"]);
});
