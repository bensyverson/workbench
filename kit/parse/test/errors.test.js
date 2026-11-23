import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLambda } from "../index.js";

/** @import { Diagnostic } from "../ast.js" */

/** Parses `src`, expecting failure; returns the single diagnostic. @param {string} src @returns {Diagnostic} */
function fails(src) {
  const r = parseLambda(src);
  assert.equal(r.ok, false, `expected ${JSON.stringify(src)} to fail`);
  assert.equal(r.diagnostics.length, 1, JSON.stringify(r.diagnostics));
  const d = r.diagnostics[0];
  assert.equal(d.severity, "error");
  assert.ok(d.tip.length > 10, `${d.code} has a tip: ${d.tip}`);
  assert.ok(!d.tip.includes("\n"), "tips are one line");
  return d;
}

test("P001 unexpected token names what was found and where", () => {
  const d = fails("(a) => a +* 2");
  assert.equal(d.code, "P001");
  assert.match(d.message, /\*/);
  assert.deepEqual(d.loc.start, { line: 1, column: 10 });
});

test("P002 unterminated string, template or comment", () => {
  assert.equal(fails('(a) => "abc').code, "P002");
  assert.equal(fails("(a) => `abc").code, "P002");
  assert.equal(fails("(a) => a /* never closed").code, "P002");
});

test("P003 source that is not a single arrow function", () => {
  const d = fails("function (a) { return a; }");
  assert.equal(d.code, "P003");
  assert.match(d.tip, /=>/);
  assert.equal(fails("(a) => a; (b) => b").code, "P003");
  assert.equal(fails("a + 1").code, "P003");
});

test("P004 unsupported syntax names the construct", () => {
  /** @type {Array<[string, RegExp]>} */
  const cases = [
    ["(a) => { switch (a) { case 1: return 2; } }", /switch/],
    ["(a) => { class X {} }", /class/],
    ["(a) => { function f() {} }", /function/],
    ["(a) => { try { a(); } catch (e) {} }", /try/],
    ["(a) => { throw a; }", /throw/],
    ["async (a) => a", /async/],
    ["(a) => /ab+c/.test(a)", /regular expression/],
    ["(a) => { outer: for (;;) break outer; }", /label/],
    ["(a) => ({ get x() { return 1; } })", /getter|method/],
    ["(a) => ({ f() { return 1; } })", /method/],
  ];
  for (const [src, re] of cases) {
    const d = fails(src);
    assert.equal(d.code, "P004", src);
    assert.match(d.message, re, src);
  }
});

test("P005 invalid assignment target", () => {
  const d = fails("(a) => a + 1 = 2");
  assert.equal(d.code, "P005");
  assert.equal(fails("(a) => 1++").code, "P005");
});
