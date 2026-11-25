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
