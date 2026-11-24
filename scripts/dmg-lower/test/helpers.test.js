// A preset's top-level helpers are lowered with its lambdas, and a lambda that calls one runs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadDmg } from "../../dmg-oracle/load.js";
import { lowerPreset, emitEntry, helperSources } from "../pipeline.js";

const dmg = loadDmg();

test("preset 14: the lambdas that call the top-level nth lower, and so does nth", () => {
  const { entries, helpers } = lowerPreset(dmg, "14");
  assert.deepEqual(helpers.map((h) => h.name), ["nth"]);
  assert.equal(helpers[0].result.ok, true, helpers[0].result.diagnostics.map((d) => d.message).join("; "));
  const memory = entries.filter((e) => /^memory\./.test(e.slot.id));
  assert.ok(memory.length >= 2);
  for (const e of memory) assert.deepEqual(e.result.diagnostics.filter((d) => d.severity === "error").map((d) => d.code), [], e.slot.id);
});

test("only the helpers a runtime lambda uses, directly or through another, are lowered", () => {
  const { helpers } = lowerPreset(dmg, "14");
  assert.ok(!helpers.some((h) => h.name === "cell"), "cell builds the board and no runtime lambda calls it");
});

test("an emitted lambda runs with its helpers in scope", () => {
  const { entries } = lowerPreset(dmg, "14");
  const e = entries.find((x) => /^memory\.onFrame/.test(x.slot.id));
  assert.ok(e);
  const { emitted, fn } = emitEntry(/** @type {NonNullable<typeof e>} */ (e));
  assert.match(emitted.source, /nth\(/);
  assert.equal(typeof fn, "function");
});

test("a program with no helpers lowers as before", () => {
  const { helpers, entries } = lowerPreset(dmg, "04");
  assert.deepEqual(helpers, []);
  assert.ok(entries.every((e) => e.result.ok));
});

test("an arrow helper is a function even when it breaks the subset; only a non-arrow is a constant", () => {
  const code = "const N = 4;\nconst isBrick = (c) => /b/.test(c);\nconst grow = (b) => [...b];\nGame(\"g\").build();\n";
  const kinds = Object.fromEntries(helperSources(code, ["(w) => isBrick(w) + grow(w) + N"]).map((h) => [h.name, h.kind]));
  assert.deepEqual(kinds, { N: "const", isBrick: "fn", grow: "fn" });
});
