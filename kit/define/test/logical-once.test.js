// One mistake, one diagnostic: a non-bool operand of || or && in a value is a single L003 at the first such
// operand, and the result does not cascade into the code that uses it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defineDialect, defineGrammar, exact, name, lambda } from "../index.js";

const mk = (/** @type {Record<string, unknown>} */ extra = {}) => {
  const d = defineDialect({
    name: "s", numberType: "f64", text: () => "", spaces: { s: { pure: true } },
    objects: { P: { label: "p", members: { n: "f64", b: "bool" } } }, targets: { js: { accepts: "*", compare: exact() } },
    slots: { k: { params: ["P"], returns: "f64", space: "s" } }, ...extra,
  });
  const g = defineGrammar(d, { root: "p", constructs: { p: { opens: [name()], slots: { k: { kind: "decl", args: [lambda("k")] } } } } });
  return (/** @type {string} */ src) => g.lower(g("x").k(src).build({})).diagnostics.map((x) => `${x.code} ${x.message}`);
};

const run = mk();
test(`a number operand of || in a value is one L003`, () => {
  const out = run("(p) => { const x = p.n || 2; return x; }");
  assert.equal(out.length, 1, out.join("\n"));
  assert.match(out[0], /^L003 '\|\|' in a value needs bools on both sides/);
});
test(`a number operand of && in a value is one L003`, () => {
  const out = run("(p) => { const x = p.b && p.n; return 1; }");
  assert.equal(out.length, 1, out.join("\n"));
  assert.match(out[0], /^L003 '&&' in a value needs bools/);
});
test(`bool operands still lower`, () => {
  assert.deepEqual(run("(p) => { const x = p.b || p.b; return 1; }"), []);
});
