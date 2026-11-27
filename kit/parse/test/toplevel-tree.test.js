// The whole-file scan reads a syntax tree (acorn, through module.js), so what the old lexical scan documented as
// misreads is now right, and a file that does not parse is refused (ScanError) rather than half read (leaf VsPb2e).
import { test } from "node:test";
import assert from "node:assert/strict";
import { topLevelNames, topLevelBindings, topLevelFunctions, topLevelRefs, functionAsArrow, buildTimeNames, buildTimeBindings, buildTimeShadows, ScanError } from "../toplevel.js";

test("a line comment ends at U+2028 and at a lone CR, so a declaration after it is seen", () => {
  assert.deepEqual(topLevelNames("const a = 1; // c const B = 2;\n"), ["a", "B"]);
  assert.deepEqual(topLevelNames("const a = 1; // c\rconst B = 2;\n"), ["a", "B"]);
});

test("two labels before a block, a label after a statement without ;, and a label after an if head are labels", () => {
  assert.deepEqual(topLevelNames("a: b: {}\n/{/.test(s);\nconst z = 1;\n"), ["z"]);
  assert.deepEqual(topLevelNames("let q = 1\nl: {}\n/{/.test(s);\nconst z = 1;\n"), ["q", "z"]);
  assert.deepEqual(topLevelNames("if (q) l: {}\n/{/.test(s);\nconst z = 1;\n"), ["z"]);
});

test("a `/` after default, extends and a prefix ++ is read as JavaScript reads it", () => {
  assert.deepEqual(topLevelNames("export default /}/.test(s) ? 1 : 2;\nconst z = 1;\n"), ["z"]);
  assert.deepEqual(topLevelNames("let i = 0, j = 0;\nconst a = 8 / ++i / 2;\nconst z = '/';\n"), ["i", "j", "a", "z"]);
});

test("an object literal after a ternary's : directly inside a block is an object, so a `/` after its } is division", () => {
  assert.deepEqual(topLevelNames("function f(c) { c ? 1 : {} / 2; }\nconst z = '/';\nconst y = 1;\n"), ["f", "z", "y"]);
});

test("buildTimeNames sees the parameters of a function whose list holds a paren", () => {
  assert.deepEqual(buildTimeNames("function f(a = g(), { b } = h()) { const q = 1; }\n").sort(), ["a", "b", "q"]);
  assert.deepEqual(buildTimeNames("const f = (a = g(1), [b]) => a;\n").sort(), ["a", "b"]);
});

// issue ocy5OI, its four findings
test("ocy5OI A: a statement-word method in an object after a ternary's : in a case clause is a method (was a miss)", () => {
  const code = "const K = 1;\nconst g = (v) => { switch (v) { case 1: x = c ? d : { if(K) { return b().f((p) => K); } }; } };\nexport default () => g;";
  assert.deepEqual(buildTimeShadows(code), ["K"]);
});

test("ocy5OI B: a computed method on the line after a class field with no initializer is a method (was a miss)", () => {
  assert.deepEqual(buildTimeShadows("const K = 1;\nclass B { x\n  [k](K) { return b().f((p) => K); } }\nexport default () => new B();"), ["K"]);
});

test("ocy5OI D: a class before a block, and a statement word after await, return or typeof, make no method", () => {
  assert.deepEqual(buildTimeShadows("const K = 1;\nclass A {}\nconst g = (c) => { if (c) { if (K) { b((y) => y); } } };\nexport default () => b();"), []);
  assert.deepEqual(buildTimeShadows("const K = 1;\nconst g = async (c) => { await h(c)\n  { if (K) { b((y) => y); } } };\nexport default () => b();"), []);
  assert.deepEqual(buildTimeShadows("const K = 1;\nconst g = (c) => { typeof c\n  { if (K) { b((y) => y); } } };\nexport default () => b();"), []);
});

test("ocy5OI C: the scan stays linear in sibling blocks and ternary objects in one case clause", () => {
  const blocks = (/** @type {number} */ n) => `const K = 1;\nconst g = (a) => { ${"{ if (a) { a++; } }\n".repeat(n)} };\nexport default () => b();`;
  const cases = (/** @type {number} */ n) => `const K = 1;\nconst g = (a) => { switch (a) { case 1: ${"x = c ? d : { y: 1 };\n".repeat(n)} } };\nexport default () => b();`;
  const best = (/** @type {string} */ code) => Math.min(...[0, 1, 2].map(() => { const t = performance.now(); buildTimeShadows(code); return performance.now() - t; }));
  for (const gen of [blocks, cases]) {
    best(gen(300));
    const small = best(gen(1000)), large = best(gen(4000));
    assert.ok(large < Math.max(small, 5) * 10, `1000: ${small.toFixed(1)} ms, 4000: ${large.toFixed(1)} ms`);
  }
});

test("JYmuWM: a Runtime Lambda holding a query callback lists its own parameter unless the host names it compiled", () => {
  // No syntax tells it from a build-time callback holding a lambda (`$.each((x) => b.update((p) => x + p))`), so the
  // scan alone fails closed; kit/define passes the texts of the lambdas it was handed.
  const code = "const dt = 0.1;\nexport default () => b().update((p, dt) => p.items.some((q) => q.x > dt)).spawn((p) => p.x * dt);";
  assert.deepEqual(buildTimeShadows(code), ["dt"]);
  assert.deepEqual(buildTimeShadows(code, ["(p, dt) => p.items.some((q) => q.x > dt)", "(p) => p.x * dt"]), []);
});

test("a file that does not parse is refused with a ScanError that says where, by every function that reads one", () => {
  const bad = "const a = 1;\nconst b = ;\n";
  for (const f of [topLevelNames, topLevelBindings, topLevelFunctions, buildTimeNames, buildTimeBindings, buildTimeShadows]) {
    assert.throws(() => f(bad), (e) => e instanceof ScanError && e.line === 2 && /line 2/.test(e.message), f.name);
  }
  assert.throws(() => topLevelRefs("(x) => x +", ["a"]), ScanError);
});

test("what a module cannot hold is refused too: a duplicate const, a `with`, a decorator, a function declared twice", () => {
  assert.throws(() => topLevelNames("const a = 1;\nconst a = 2;\n"), (e) => e instanceof ScanError && e.binding === "a" && e.line === 2 && /twice/.test(e.message));
  assert.throws(() => topLevelNames("with (o) { f(); }\n"), ScanError);
  assert.throws(() => topLevelNames("@dec class A {}\n"), ScanError);
  assert.throws(() => topLevelNames("function g() {}\nfunction g() {}\n"), (e) => e instanceof ScanError && e.binding === "g");
});

test("an expression that wraps `)` cannot make a text pass as one function declaration", () => {
  assert.ok("error" in functionAsArrow("function f(a) { return a; }) + (function g() {}"));
  assert.ok("error" in functionAsArrow("function f(a) { return a; }, 1"));
  assert.ok("error" in functionAsArrow("function f(a) { return a; } // c\n.call"));
  assert.deepEqual(functionAsArrow("function f(a) /* c */ { return a; } // end"), { arrow: "(a) => { return a; }" });
});

test("topLevelRefs resolves scope: a name declared in one block hides no read outside it", () => {
  assert.deepEqual(topLevelRefs("(w) => { if (w) { const n = 1; return n; } return n; }", ["n"]), ["n"]);
  assert.deepEqual(topLevelRefs("(w) => { for (const n of w) { w.f(n); } return 1; }", ["n"]), []);
  assert.deepEqual(topLevelRefs("(w) => { try { f(); } catch (n) { return n; } }", ["n", "f"]), ["f"]);
  assert.deepEqual(topLevelRefs("(w) => w.map(function n(v) { return v; })", ["n"]), []);
  assert.deepEqual(topLevelRefs("(w) => { var n = 1; { var m = n; } return m; }", ["n", "m"]), []);
});
