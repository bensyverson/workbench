// logical() after a8921a7: one L003 at the first non-bool operand, but independent mistakes and effects
// on either side must still be reported, and bool code must still lower.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defineDialect, defineGrammar, exact, name, lambda } from "../index.js";

const mk = (/** @type {Record<string, unknown>} */ extra = {}) => {
  const d = defineDialect({
    name: "s", numberType: "f64", text: () => "", spaces: { s: { instance: "P" } },
    objects: { P: { label: "p", members: { n: { value: "f64", write: true }, b: "bool", m: { value: "f64", write: true } } } },
    targets: { js: { accepts: "*", compare: exact() } },
    slots: { k: { params: ["P"], returns: "f64", space: "s", may: ["write P.n"] } }, ...extra,
  });
  const g = defineGrammar(d, { root: "p", constructs: { p: { opens: [name()], slots: { k: { kind: "decl", args: [lambda("k")] } } } } });
  return (/** @type {string} */ src) => {
    const out = g.lower(g("x").k(src).build({}));
    return out.diagnostics.map((x) => `${x.code} ${x.message}`);
  };
};

const run = mk();
test(`left non-bool, right an unknown member: both reported`, () => {
  const out = run("(p) => { const x = p.n || p.zz; return 1; }");
  assert.equal(out.length, 2, out.join("\n"));
  assert.match(out.join("\n"), /L003/); assert.match(out.join("\n"), /L002/);
});
test(`left non-bool, right writes a member outside may: L004 still reported`, () => {
  const out = run("(p) => { const x = p.n || ((p.m = 1) > 0); return 1; }");
  assert.ok(out.some((d) => d.startsWith("L004")), out.join("\n"));
});
test(`left an unknown member, right bool: one L002`, () => {
  const out = run("(p) => { const x = p.zz || p.b; return 1; }");
  assert.deepEqual(out.map((d) => d.slice(0, 4)), ["L002"]);
});
test(`nested chains give one L003`, () => {
  for (const src of ["(p) => { const x = (p.n || 2) || p.b; return 1; }", "(p) => { const x = p.b && (p.n || 1); return 1; }", "(p) => { const x = p.b && p.b || p.n; return 1; }", "(p) => { const x = p.n && p.n && p.n; return 1; }"]) {
    const out = run(src);
    assert.equal(out.length, 1, `${src}\n${out.join("\n")}`);
  }
});
test(`bool chains still lower`, () => {
  for (const src of ["(p) => { const x = p.b && (p.n > 1 || p.b); return x ? 1 : 0; }", "(p) => { const x = !(p.b || p.b) && p.n < 2; return x ? 1 : 0; }", "(p) => { const x = p.b ? (p.b || p.b) : false; return x ? 1 : 0; }", "(p) => (p.b && p.b) ? 1 : 2"]) {
    assert.deepEqual(run(src), [], src);
  }
});
test(`right side's effect inside && lowers when operands are bool`, () => {
  assert.deepEqual(run("(p) => { const x = p.b && ((p.n = 1) > 0); return x ? 1 : 0; }"), []);
});
test(`a test of a non-bool || is one diagnostic`, () => {
  const out = run("(p) => { if (p.n || p.b) return 1; return 2; }");
  assert.equal(out.length, 1, out.join("\n"));
});
