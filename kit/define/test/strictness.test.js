// The Definition API's lowering strictness (decision MpZZsU, items 2, 3, 4, 6, 7): `conditions: "bool"`, a vector's
// `multiply: "scalar"`, a value must be returned on every path (on by default), a convention's `body: "block"`, and
// one diagnostic after a parameter-count error. Each new strictness is opt-in except the returns check.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defineDialect, defineGrammar, exact, vector, opt, name, lambda, DefinitionError } from "../index.js";

/**
 * A Dialect with one object `P` (a number `n`, a flag `b`, a vector `v`), and a grammar with one slot `k`.
 * @param {{ dialect?: Record<string, any>, conv?: Record<string, any>, vec?: any, units?: Array<{ name: string, src: string }> }} o
 */
const harness = (o = {}) => {
  const d = defineDialect({
    name: "strict", numberType: "f64", text: () => "",
    types: { vec2: o.vec ?? vector(2, "f64") },
    spaces: { s: { pure: true } },
    objects: { P: { label: "p", members: { n: "f64", b: "bool", v: "vec2" } } },
    targets: { js: { accepts: "*", compare: exact() } },
    slots: { k: { params: ["P"], returns: "f64", space: "s", ...o.conv } },
    ...o.dialect,
  });
  const g = defineGrammar(d, { root: "p", constructs: { p: { opens: [name()], slots: { k: { kind: "decl", args: [lambda("k")] }, fn: { kind: "unit", unit: "fn" } } } } });
  /** @param {string} src */
  return (src) => {
    /** @type {any} */
    let b = g("x");
    for (const u of o.units ?? []) b = b.fn(u.name, u.src);
    return g.lower(b.k(src).build()).diagnostics.map((x) => x.code);
  };
};

const BOOL = { dialect: { conditions: "bool" } };

test("conditions: a number as an if, ternary or ! operand is one L003; a bool still works", () => {
  const run = harness({ ...BOOL, conv: { returns: "void" } });
  assert.deepEqual(run("(p) => { if (p.n) { p.n; } }"), ["L003"]);
  assert.deepEqual(run("(p) => { const x = p.n ? 1 : 2; }"), ["L003"]);
  assert.deepEqual(run("(p) => { if (!p.n) { p.n; } }"), ["L003"]);
  assert.deepEqual(run("(p) => { if (p.n > 1 && p.b || !p.b) { p.n; } }"), []);
  assert.deepEqual(run("(p) => { const x = p.b ? 1 : 2; }"), []);
});

test("conditions: a number operand of && or || in a condition is one L003 each", () => {
  const run = harness({ ...BOOL, conv: { returns: "void" } });
  assert.deepEqual(run("(p) => { if (p.n > 1 && p.n) { p.n; } }"), ["L003"]);
  assert.deepEqual(run("(p) => { if (p.n || p.n < 0.5) { p.n; } }"), ["L003"]);
});

test("conditions: a vector as a condition is one diagnostic, not two", () => {
  const run = harness({ ...BOOL, conv: { returns: "void" } });
  assert.deepEqual(run("(p) => { if (p.v) { p.n; } }"), ["L003"]);
});

test("conditions: the default still takes a number as a condition", () => {
  const run = harness({ conv: { returns: "void" } });
  assert.deepEqual(run("(p) => { if (p.n) { p.n; } }"), []);
  assert.deepEqual(run("(p) => { const x = p.n ? 1 : 2; }"), []);
});

test("conditions: only \"bool\" is a value", () => {
  assert.throws(() => harness({ dialect: { conditions: "number" } }), (e) => e instanceof DefinitionError && e.diagnostics.some((d) => d.code === "D011" && d.path[0] === "conditions"));
});

test("multiply: \"scalar\" refuses vector * vector (one L003), and keeps vector * number, number * vector and vector + vector", () => {
  const run = harness({ vec: vector(2, "f64", { multiply: "scalar" }), conv: { returns: "void" } });
  assert.deepEqual(run("(p) => { const a = p.v * vec2(1, 2); }"), ["L003"]);
  assert.deepEqual(run("(p) => { let a = p.v; a *= vec2(1, 2); }"), ["L003"]);
  assert.deepEqual(run("(p) => { const a = p.v * 2; }"), []);
  assert.deepEqual(run("(p) => { const a = 2 * p.v; }"), []);
  assert.deepEqual(run("(p) => { const a = p.v + vec2(1, 2); }"), []);
  assert.deepEqual(run("(p) => { const a = p.v / 2; }"), []);
});

test("multiply: number / vector is an L003 whatever the option says", () => {
  assert.deepEqual(harness({ vec: vector(2, "f64", { multiply: "scalar" }), conv: { returns: "void" } })("(p) => { const a = 2 / p.v; }"), ["L003"]);
  assert.deepEqual(harness({ conv: { returns: "void" } })("(p) => { const a = 2 / p.v; }"), ["L003"]);
});

test("multiply: the default multiplies vectors componentwise", () => {
  assert.deepEqual(harness({ conv: { returns: "void" } })("(p) => { const a = p.v * vec2(1, 2); }"), []);
});

test("multiply: only \"scalar\" or \"componentwise\" is a value, and aliases still go with it", () => {
  assert.throws(() => harness({ vec: vector(2, "f64", { multiply: "dot" }) }), (e) => e instanceof DefinitionError && e.diagnostics.some((d) => d.code === "D011"));
  assert.throws(() => harness({ vec: vector(2, "f64", { divide: "scalar" }) }), (e) => e instanceof DefinitionError && e.diagnostics.some((d) => d.code === "D011"));
  harness({ vec: vector(2, "f64", { multiply: "scalar", aliases: { u: "x" } }) });
  harness({ vec: vector(2, "f64", { multiply: "componentwise" }) });
});

test("returns on every path: a value slot that can reach its end is one L003", () => {
  const run = harness();
  assert.deepEqual(run("(p) => { if (p.n > 1) { return 1; } }"), ["L003"]);
  assert.deepEqual(run("(p) => { }"), ["L003"]);
  assert.deepEqual(run("(p) => { for (let i = 0; i < 3; i++) { return 1; } }"), ["L003"]);
});

test("returns on every path: if/else, a final return, nested blocks and an expression body are fine", () => {
  const run = harness();
  assert.deepEqual(run("(p) => { if (p.n > 1) { return 1; } else { return 2; } }"), []);
  assert.deepEqual(run("(p) => { if (p.n > 1) { return 1; } return 2; }"), []);
  assert.deepEqual(run("(p) => { { return 1; } }"), []);
  assert.deepEqual(run("(p) => { for (let i = 0; i < 3; i++) { p.n; } return 2; }"), []);
  assert.deepEqual(run("(p) => p.n"), []);
});

test("returns on every path: a void slot may end anywhere", () => {
  const run = harness({ conv: { returns: "void" } });
  assert.deepEqual(run("(p) => { if (p.n > 1) { return; } }"), []);
});

test("returns on every path: a slot that returns an optional value may end without one", () => {
  const run = harness({ conv: { returns: opt("f64") } });
  assert.deepEqual(run("(p) => { if (p.n > 1) { return 1; } }"), []);
});

test("returns on every path: an inferred slot keeps its optional type, as a method's does; only a helper is held to it", () => {
  const run = harness({ conv: { returns: "infer" } });
  assert.deepEqual(run("(p) => { if (p.n > 1) { return 1; } }"), []);
  assert.deepEqual(run("(p) => { p.n; }"), []);
});

test("returns on every path: a helper that can end without returning is one diagnostic, at the helper, and its caller adds none", () => {
  const units = [{ name: "pick", src: "(a) => { if (a > 1) { return 1; } }" }];
  const run = harness({ units, conv: { returns: "f64" } });
  assert.deepEqual(run("(p) => pick(p.n)"), ["L003"]);
  assert.deepEqual(harness({ units: [{ name: "pick", src: "(a) => { if (a > 1) { return 1; } return 0; }" }] })("(p) => pick(p.n)"), []);
});

test("body: \"block\": an expression body is one L012; a block body is fine", () => {
  const run = harness({ conv: { returns: "void", body: "block" } });
  assert.deepEqual(run("(p) => p.n"), ["L012"]);
  assert.deepEqual(run("(p) => { p.n; }"), []);
});

test("body: \"block\" also works on a convention function, and the default allows an expression body", () => {
  const fn = harness({ dialect: { slots: { k: () => ({ params: ["P"], returns: "f64", space: "s", body: "block" }) } } });
  assert.deepEqual(fn("(p) => p.n"), ["L012"]);
  assert.deepEqual(fn("(p) => { return p.n; }"), []);
  assert.deepEqual(harness({ conv: { returns: "void" } })("(p) => p.n"), []);
});

test("body: only \"block\" is a value", () => {
  assert.throws(() => harness({ conv: { body: "expression" } }), (e) => e instanceof DefinitionError && e.diagnostics.some((d) => d.code === "D011" && d.path.includes("body")));
  const bad = harness({ dialect: { slots: { k: () => ({ params: ["P"], returns: "f64", space: "s", body: "expr" }) } } });
  assert.throws(() => bad("(p) => p.n"), (e) => e instanceof DefinitionError && e.diagnostics.some((d) => d.code === "D011"));
});

test("one code per mistake: a lambda's extra parameter is L010 and its uses add no L001", () => {
  const run = harness({ conv: { params: ["P", "f64"], returns: "f64" } });
  assert.deepEqual(run("(p, live, rng) => rng()"), ["L010"]);
  assert.deepEqual(run("(p, live, rng) => { return live + rng; }"), ["L010"]);
});
