// End to end: a lambda made inside a build-time map callback reads the callback's K; the kit bakes the
// top-level K instead and builds clean, because buildTimeShadows no longer lists K.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defineDialect, defineGrammar, exact, name, lambda } from "../index.js";
import { buildTimeShadows, buildTimeNames } from "../../parse/toplevel.js";

const d = defineDialect({
  name: "s", numberType: "f64", text: () => "", spaces: { s: { pure: true } },
  objects: { P: { label: "p", members: { n: "f64" } } }, targets: { js: { accepts: "*", compare: exact() } },
  slots: { k: { params: ["P"], returns: "f64", space: "s" } },
});
const g = defineGrammar(d, { root: "p", constructs: { p: { opens: [name()], slots: { k: { kind: "decl", args: [lambda("k")] } } } } });

const text = "const K = 1;\nexport default () => g(\"x\").k([2].map((K) => (p) => p.n * K)[0]);";
test("a lambda reading a build-time callback's K is refused, not baked as the top-level K", () => {
  const K = 1;
  const prog = g("x").k([2].map((K) => (/** @type {any} */ p) => p.n * K)[0]);
  const opts = { scope: { K }, sources: {}, buildTime: buildTimeNames(text), shadowed: buildTimeShadows(text) };
  const diags = prog.check(/** @type {any} */ (opts));
  assert.ok(diags.some((/** @type {any} */ x) => x.code === "B013"), `check gave ${JSON.stringify(diags.map((/** @type {any} */ x) => x.code))}; shadowed=${JSON.stringify(opts.shadowed)}`);
});
