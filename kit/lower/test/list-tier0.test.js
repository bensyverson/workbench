// CPU tier stage 0 (project/2026-11-27-cpu-tier-draft.md): `xs.length` on every list in every Dialect, `??`, and a
// loop index that narrows its read, each lowered in a Definition API Dialect and run on the interpreter and the
// emitted JS alike. Every Kernel also carries `needs: []`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defineDialect, defineGrammar, exact, list, lambda, name } from "../../define/index.js";
import { run } from "../../interp/index.js";
import { emitKernel, instantiate } from "../../emit/js/index.js";
import { printKernel } from "../../ir/print.js";
import { verify } from "../../ir/verify.js";
import { dmgEnvironment } from "../../dialects/dmg/index.js";
import { DECLS } from "./fixture.js";
import { lowerLambda } from "../index.js";

/** @import { Kernel } from "../../ir/ir.js" */

const d = defineDialect({
  name: "tier0",
  numberType: "f64",
  types: {},
  spaces: { calc: { pure: true } },
  targets: { js: { accepts: "*", compare: exact() } },
  slots: {
    onCodes: { params: [list("f64", 8)], returns: "f64", space: "calc" },
    onAt: { params: [list("f64", 8), "f64"], returns: "f64", space: "calc" },
    onFlag: { params: [list("f64", 8), "f64"], returns: "bool", space: "calc" },
  },
  text: () => "",
});

const g = defineGrammar(d, {
  root: "p",
  constructs: {
    p: {
      opens: [name()],
      slots: {
        codes: { kind: "decl", args: [name("c"), lambda("onCodes")] },
        at: { kind: "decl", args: [name("a"), lambda("onAt")] },
        flag: { kind: "decl", args: [name("f"), lambda("onFlag")] },
      },
    },
  },
});

/**
 * Lowers one lambda in the slot `on`; returns the diagnostics and the Kernel when there is one.
 * @param {"codes" | "at" | "flag"} slot
 * @param {string} src
 */
function lowerIn(slot, src) {
  const rec = g("x")[slot]("l", src).build();
  const r = g.lower(rec);
  const errors = r.diagnostics.filter((x) => x.severity === "error").map((x) => `${x.code} ${x.message}`);
  const kernel = /** @type {Kernel | undefined} */ (r.lambdas[0]?.result?.kernel);
  return { errors, kernel };
}

/**
 * Lowers, asserts success, and returns the Kernel.
 * @param {"codes" | "at" | "flag"} slot
 * @param {string} src
 */
function ok(slot, src) {
  const { errors, kernel } = lowerIn(slot, src);
  assert.deepEqual(errors, []);
  assert.ok(kernel);
  return kernel;
}

/**
 * Runs a Kernel on the interpreter and as emitted JS; asserts they agree and returns the value.
 * @param {Kernel} k
 * @param {unknown[]} inputs
 */
function both(k, inputs) {
  assert.deepEqual(verify(k), [], "the kernel verifies");
  const fromInterp = run(k, structuredClone(inputs));
  const fromJs = instantiate(emitKernel(k))(...structuredClone(inputs));
  assert.deepEqual(fromJs, fromInterp, "emitted JS and the interpreter agree");
  return fromInterp;
}

const g32 = defineGrammar(defineDialect({
  name: "tier0f32",
  numberType: "f32",
  types: {},
  spaces: { calc: { pure: true } },
  targets: { js: { accepts: "*", compare: exact() } },
  slots: { onCodes: { params: [list("f32", 8)], returns: "f32", space: "calc" } },
  text: () => "",
}), { root: "p", constructs: { p: { opens: [name()], slots: { codes: { kind: "decl", args: [name("c"), lambda("onCodes")] } } } } });

const SUM = "(xs) => { let s = 0; for (let i = 0; i < xs.length; i++) { s += xs[i]; } return s; }";

test("a list's length reads in a Definition API Dialect, which declares no list members", () => {
  const k = ok("codes", "(xs) => xs.length");
  assert.equal(both(k, [[4, 5, 6]]), 3);
  assert.equal(both(k, [[]]), 0);
});

test("a loop bounded by a list's length lowers there, with the list's max as its bound", () => {
  const k = ok("codes", "(xs) => { let s = 0; for (let i = 0; i < xs.length; i++) { const x = xs[i]; s += x; } return s; }");
  const loop = k.body.find((s) => s.k === "for");
  assert.equal(loop?.k === "for" && loop.bound, "size ≤ 8");
  assert.equal(both(k, [[1, 2, 3]]), 6);
});

test("length is a number, so it cannot be set or called", () => {
  assert.match(lowerIn("codes", "(xs) => { xs.length = 2; return 0; }").errors.join("|"), /L\d+/);
  assert.match(lowerIn("codes", "(xs) => xs.length()").errors.join("|"), /L\d+/);
  assert.match(lowerIn("codes", "(xs) => xs.size").errors.join("|"), /L002.*size/);
});

test("the DMG environment no longer declares the list's length itself, and still reads it", () => {
  const env = dmgEnvironment(DECLS);
  assert.deepEqual(Object.keys(env.list ?? {}), []);
});

test("a loop to a list's length lowers in an f32 Dialect too, and runs on both targets", () => {
  const src = "(xs) => { let s = 0; for (let i = 0; i < xs.length; i++) { s += xs[i]; } return s; }";
  const r = g32("x").codes("l", src).build();
  const out = g32.lower(r);
  assert.deepEqual(out.diagnostics.filter((x) => x.severity === "error").map((x) => `${x.code} ${x.message}`), []);
  const k = /** @type {Kernel} */ (out.lambdas[0].result.kernel);
  assert.equal(both(k, [[1, 2, 3.5]]), 6.5);
});

// --- ?? ---------------------------------------------------------------------------------------------------------

test("a possibly-empty item `?? 0` is the item or the fallback, and is not empty", () => {
  const k = ok("at", "(xs, i) => xs[i] ?? 0");
  assert.equal(k.returns, "f64");
  assert.equal(both(k, [[7, 8, 9], 1]), 8);
  assert.equal(both(k, [[7, 8, 9], 5]), 0);
  assert.equal(both(k, [[7, 8, 9], -1]), 0);
  assert.equal(both(k, [[7, 0, 9], 1]), 0, "a present 0 stays 0: ?? tests emptiness, not truthiness");
});

test("?? reads its left side once, into a temporary", () => {
  const k = ok("at", "(xs, i) => xs[i] ?? 0");
  assert.equal(printKernel(k).split("xs[i]").length - 1, 1);
});

test("?? joins its sides: the fallback must fit the item's type", () => {
  const { errors } = lowerIn("at", "(xs, i) => xs[i] ?? \"none\"");
  assert.match(errors.join("|"), /L003/);
});

test("?? on a value that is never empty is L003, with a tip", () => {
  const { errors } = lowerIn("at", "(xs, i) => i ?? 0");
  assert.match(errors.join("|"), /L003/);
  assert.match(errors.join("|"), /never empty/);
});

test("?? chains, and takes any fallback expression, even one that needs a statement of its own", () => {
  const k = ok("at", "(xs, i) => xs[i] ?? xs[i + 1] ?? (xs.length > 0 ? 1 : 2)");
  assert.equal(both(k, [[], 0]), 2);
  assert.equal(both(k, [[3], 0]), 3);
  assert.equal(both(k, [[3, 4], 1]), 4);
});

test("?? works as a condition operand and in a const", () => {
  const k = ok("flag", "(xs, i) => { const v = xs[i] ?? -1; return v > 0 && (xs[i] ?? 0) < 100; }");
  assert.equal(both(k, [[5, 500], 0]), true);
  assert.equal(both(k, [[5, 500], 1]), false);
  assert.equal(both(k, [[5, 500], 2]), false);
});

test("`??=` is still not lowered", () => {
  assert.match(lowerIn("at", "(xs, i) => { let v = xs[i]; v ??= 1; return 0; }").errors.join("|"), /L012/);
});

// --- the loop index narrows its read ----------------------------------------------------------------------------

test("inside a loop to xs.length, xs[i] is not empty and needs no check", () => {
  const k = ok("codes", SUM);
  assert.equal(both(k, [[1, 2, 3, 4]]), 10);
  assert.equal(both(k, [[]]), 0);
});

test("the narrowing reaches nested statements and an inlined query callback", () => {
  ok("codes", "(xs) => { let s = 0; for (let i = 0; i < xs.length; i++) { if (xs[i] > 2) { s += xs[i] * 2; } } return s; }");
});

test("the narrowing does not reach other lists, other indices, offsets, or past the loop", () => {
  const body = (/** @type {string} */ stmt) => `(xs) => { let s = 0; const ys = [1, 2, 3]; for (let i = 0; i < xs.length; i++) { ${stmt} } return s; }`;
  assert.match(lowerIn("codes", body("s += ys[i];")).errors.join("|"), /L003/, "another list: ys is a literal of 3, i is not constant");
  assert.match(lowerIn("codes", body("s += xs[i + 1];")).errors.join("|"), /L003/, "an offset");
  assert.match(lowerIn("codes", body("s += xs[0];")).errors.join("|"), /L003/, "a constant index");
  assert.match(lowerIn("codes", "(xs) => { let s = 0; for (let i = 0; i < xs.length; i++) { s += 1; } return s + xs[0]; }").errors.join("|"), /L003/, "past the loop");
});

test("the narrowing needs a start at zero or above, a `<` test, and a list that is not rewritten", () => {
  assert.match(lowerIn("codes", "(xs) => { let s = 0; for (let i = -1; i < xs.length; i++) { s += xs[i]; } return s; }").errors.join("|"), /L003/, "negative start");
  assert.match(lowerIn("codes", "(xs) => { let s = 0; for (let i = 0; i <= xs.length; i++) { s += xs[i]; } return s; }").errors.join("|"), /L003/, "<= reads one past the end");
  assert.match(lowerIn("codes", "(xs) => { let ys = xs; let s = 0; for (let i = 0; i < ys.length; i++) { ys = [1]; s += ys[i]; } return s; }").errors.join("|"), /L003/, "the list is rewritten in the body");
  assert.deepEqual(lowerIn("codes", "(xs) => { let ys = xs; let s = 0; for (let i = 0; i < ys.length; i++) { s += ys[i]; } return s; }").errors, [], "a let list the body leaves alone");
});

test("a shadowing name inside the loop does not inherit the narrowing", () => {
  const { errors } = lowerIn("codes", "(xs) => { let s = 0; for (let i = 0; i < xs.length; i++) { const xs2 = [1, 2]; s += xs2[i]; } return s; }");
  assert.match(errors.join("|"), /L003/);
});

// The refinement keeps the pre-narrowing ways of writing a counted loop: each still lowers.
test("a null check of a loop-index read still lowers, and runs the same on both targets", () => {
  const loop = (/** @type {string} */ body) => `(xs) => { let s = 0; for (let i = 0; i < xs.length; i++) { ${body} } return s; }`;
  for (const body of [
    "const x = xs[i]; if (x != null) s += x;",
    "const x = xs[i]; if (x == null) continue; s += x;",
    "const x = xs[i]; if (x !== 99) s += x;",
    "if (xs[i] != null) s += xs[i];",
    "if (xs[i] == null) continue; s += xs[i];",
    "s += xs[i] ?? 0;",
    "const x = xs[i] ?? 5; s += x;",
    "s += xs[i] != null ? xs[i] : 100;",
    "const x = xs[i]; s += x;",
  ]) {
    const k = lowerIn("codes", loop(body));
    assert.deepEqual(k.errors, [], body);
    assert.equal(both(/** @type {Kernel} */ (k.kernel), [[1, 2, 3]]), 6, body);
  }
});

// leaf nQY0cL: a copy of a checked loop-index read was L008, since binding it lifted the narrowing the check earned
test("a copy of a checked or unchecked loop-index read lowers, as a const or a let, and runs the same", () => {
  const loop = (/** @type {string} */ body) => `(xs) => { let s = 0; for (let i = 0; i < xs.length; i++) { ${body} } return s; }`;
  for (const body of [
    "const x = xs[i]; if (x != null) { const k = x; s += k; }",
    "const x = xs[i]; if (x == null) continue; const k = x; s += k;",
    "const x = xs[i]; if (x != null) { let k = x; s += k; }",
    "const x = xs[i]; const k = x; if (k != null) s += k;",
    "const x = xs[i]; const k = x; s += k ?? 0;",
    "const x = xs[i]; if (x != null) { const k = x; const j = k; s += j; }",
  ]) {
    const k = lowerIn("codes", loop(body));
    assert.deepEqual(k.errors, [], body);
    assert.equal(both(/** @type {Kernel} */ (k.kernel), [[1, 2, 3]]), 6, body);
  }
});

test("in the DMG Dialect, a copy of a checked board read reads its fields", () => {
  const env = dmgEnvironment(DECLS);
  const B = (/** @type {string} */ body) => `(self, w) => { const ms = w.board; for (let i = 0; i < ms.length; i++) { ${body} } }`;
  for (const body of [
    "const m = ms[i]; if (m != null) { const k = m; w.score += k.ttl; }",
    "const m = ms[i]; if (m == null) continue; const k = m; w.score += k.ttl;",
    "const m = ms[i]; const n = m; if (n != null) w.score += n.ttl;",
  ]) {
    const r = lowerLambda(env, B(body), { id: "Hammer.onFrame", kind: "onFrame", on: "Hammer" });
    assert.deepEqual(r.diagnostics.filter((x) => x.severity === "error").map((x) => `${x.code} ${x.message}`), [], body);
    assert.ok(r.kernel, body);
  }
});

test("a null check of something that was never optional is still L003", () => {
  const { errors } = lowerIn("codes", "(xs) => { let s = 0; for (let i = 0; i < xs.length; i++) { if (i != null) s += 1; } return s; }");
  assert.match(errors.join("|"), /L003/);
});

// --- needs: [] ---------------------------------------------------------------------------------------------------

test("every lowered Kernel carries needs: [], and the verifier checks it", () => {
  const k = ok("codes", SUM);
  assert.deepEqual(k.needs, []);
  assert.deepEqual(verify(k), []);
  assert.deepEqual(verify(/** @type {Kernel} */ (/** @type {unknown} */ ({ ...k, needs: undefined }))).map((x) => x.code), ["V001"]);
  assert.deepEqual(verify(/** @type {Kernel} */ ({ ...k, needs: [{ need: "loop", span: [0, 1] }] })).map((x) => x.code), ["V013"]);
});
