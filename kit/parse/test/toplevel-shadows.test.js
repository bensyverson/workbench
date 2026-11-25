// buildTimeShadows: the names a file declares at its top level and again below it (issue lv8O0x), which a lambda
// cannot be told apart from by text alone, so the kit refuses a lambda that reads one.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTimeShadows, buildTimeNames } from "../toplevel.js";

test("a name declared at the top level and again in a block is a shadow, and not a build-time-only name", () => {
  const code = "const k = 3;\nconst half = (x) => x * 0.5;\nexport default ($) => {\n  for (let k = 0; k < 2; k++) {}\n  return 1;\n};\n";
  assert.deepEqual(buildTimeShadows(code), ["k"]);
  assert.ok(!buildTimeNames(code).includes("k"));
});

test("a function declared inside the export that a top-level function shares a name with is a shadow", () => {
  const code = "function scaled(a) { return a * 2; }\nexport default ($) => {\n  function scaled(a) { return a * 3; }\n  return 1;\n};\n";
  assert.deepEqual(buildTimeShadows(code), ["scaled", "a"].filter((n) => n === "scaled"));
});

test("names declared once, at the top level or only below it, are no shadow", () => {
  const code = "const k = 3;\nexport default ($) => {\n  for (let j = 0; j < 2; j++) {}\n};\n";
  assert.deepEqual(buildTimeShadows(code), []);
  assert.deepEqual(buildTimeShadows("const a = 1; const b = 2;"), []);
});

// A helper's or a Runtime Lambda's parameter is not build-time code (review of 9dfb56b, finding H1).
test("a top-level helper's parameter, a lambda's parameter and the export's own parameter are no shadow", () => {
  assert.deepEqual(buildTimeShadows("const WIDTH = 80;\nconst spread = (r, WIDTH) => r * WIDTH;\nexport default ($) => b().f((p) => WIDTH);"), []);
  assert.deepEqual(buildTimeShadows("const dt = 2;\nexport default ($) => b().force('d', (p, dt) => 1).update((p, step) => dt);"), []);
  assert.deepEqual(buildTimeShadows("const r = 1;\nfunction area(r) { return r * r; }\nexport default () => 0;"), []);
  assert.deepEqual(buildTimeShadows("const $ = 1;\nexport default ($) => 0;"), []);
  assert.deepEqual(buildTimeShadows("const q = 1;\nexport default function (q) { return 0; }"), []);
});

test("a name the export's own build code declares again is still a shadow", () => {
  assert.deepEqual(buildTimeShadows("const K = 1;\nexport default () => { const K = 2; return b(); };"), ["K"]);
  assert.deepEqual(buildTimeShadows("const K = 1;\nexport default () => { function f(K) { return K; } return b(); };"), ["K"]);
  assert.deepEqual(buildTimeShadows("const K = 1;\nexport default () => { try { f(); } catch (K) {} return b(); };"), ["K"]);
  assert.deepEqual(buildTimeShadows("const K = 1;\nexport default () => { for (const K of xs) {} return b(); };"), ["K"]);
});

test("methods (object-literal shorthand, class) and arrow parameters after a parenthesized default are seen", () => {
  assert.deepEqual(buildTimeShadows("const K = 1;\nconst make = { add(K) { return K; } };\nexport default () => 0;"), ["K"]);
  assert.deepEqual(buildTimeShadows("const K = 1;\nclass B { add(K) { return K; } }\nexport default () => 0;"), ["K"]);
  assert.deepEqual(buildTimeShadows("const K = 1;\nexport default () => { return [1].map((a = f(1), K) => K); };"), ["K"]);
  assert.deepEqual(buildTimeShadows("const K = 1;\nexport default () => { return [1].map((a, K = 2) => K); };"), ["K"]);
  assert.deepEqual(buildTimeShadows("const K = 1;\nif (K) { f(K); }\nexport default () => 0;"), []);
});
