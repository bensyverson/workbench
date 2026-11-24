// buildTimeNames: the names a file declares only inside build-time code (not at its top level), which a
// Definition API host passes to the builder so a lambda reading one is told why it cannot see it (B013).
// The rest of the scan is tested from scripts/dmg-oracle/test/toplevel.test.js, where it started.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTimeNames, topLevelNames } from "../toplevel.js";

const FILE = [
  "import { field } from \"./grammar.js\";",
  "const K = 0.5;",
  "const half = (v) => v * K;",
  "function layer(p, depth) {",
  "  const inner = depth * 2;",
  "  let { a, b: renamed } = pair;",
  "  for (const k of [1, 2]) p.channel((c) => c * k);",
  "  try { x(); } catch (err) { }",
  "  return inner;",
  "}",
  "const build = (n, [first, second]) => n + first;",
  "items.map(item => item + 1);",
  "// const commented = 1;",
  "const s = \"let quoted = 1\";",
  "export default field(\"x\").pixel((uv, u) => { const local = uv.x; return local; });",
].join("\n");

test("buildTimeNames lists every name declared below the top level: locals, parameters, loop and catch variables", () => {
  const names = buildTimeNames(FILE);
  for (const n of ["p", "depth", "inner", "a", "renamed", "k", "err", "n", "first", "second", "item", "v", "uv", "u", "local", "c"]) assert.ok(names.includes(n), `${n} in ${names}`);
});

test("buildTimeNames leaves out top-level names, object keys, imports, and text in strings and comments", () => {
  const names = buildTimeNames(FILE);
  for (const n of ["K", "half", "layer", "build", "s", "b", "commented", "quoted", "field", "pair"]) assert.ok(!names.includes(n), `${n} not in ${names}`);
  assert.deepEqual(topLevelNames(FILE), ["K", "half", "layer", "build", "s"]);
});

test("a name declared both at the top level and inside a function is a top-level name", () => {
  assert.deepEqual(buildTimeNames("const K = 1;\nfunction f() { const K = 2; const j = 3; }"), ["j"]);
});
