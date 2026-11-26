// List concatenation: `[...a, ...b]` and `[x, ...a]` in an array literal build a list whose max is the
// sum of the parts' maxes (a plain item counts 1) and whose item type is the strict join of the parts'.
// Spread anywhere else is still S109. Draft: project/2026-11-26-draw-list-draft.md, question 1.
import { test } from "node:test";
import assert from "node:assert/strict";
import { lowerLambda } from "../index.js";
import { run } from "../../interp/run.js";
import { emitKernel, instantiate } from "../../emit/js/index.js";
import { printKernel } from "../../ir/print.js";
import { verify } from "../../ir/index.js";

/** @import { Environment } from "../environment.js" */
/** @import { Kernel, Type } from "../../ir/ir.js" */

/**
 * @param {Type | "infer"} returns
 * @returns {Environment}
 */
const envReturning = (returns) => ({
  name: "concat (test)", objects: {}, list: {}, queries: [], globals: {},
  // (a: f64[≤2], b: f64[≤3], z: f64[≤0], s: str[≤2], n: f64, o: f64[≤2] | null)
  slot: () => ({
    params: [{ list: "f64", max: 2 }, { list: "f64", max: 3 }, { list: "f64", max: 0 }, { list: "str", max: 2 }, "f64", { opt: { list: "f64", max: 2 } }],
    returns, space: "row", forbid: [],
  }),
});

/** @param {string} src @param {Type | "infer"} [returns] */
const lower = (src, returns = "infer") => lowerLambda(envReturning(returns), src, { id: "t.keep", kind: "keep", on: "t" });
/** @param {string} src */
const codes = (src) => lower(src).diagnostics.filter((d) => d.severity === "error").map((d) => d.code);

/** @param {string} src @returns {Kernel} */
function ok(src) {
  const r = lower(src);
  assert.deepEqual(r.diagnostics.filter((d) => d.severity === "error").map((d) => `${d.code} ${d.message}`), []);
  return /** @type {Kernel} */ (r.kernel);
}

/** Runs the kernel in the interpreter and as emitted JS, and checks both give `want`. */
function same(/** @type {Kernel} */ k, /** @type {unknown[]} */ args, /** @type {unknown} */ want) {
  assert.deepEqual(run(k, /** @type {any} */ (args)), want, "interpreter");
  assert.deepEqual(instantiate(emitKernel(k))(...args), want, "emitted JS");
}

const NONE = /** @type {unknown} */ (null);

test("two lists: the max is the sum, and it runs the same in the interpreter and in JS", () => {
  const k = ok("(a, b) => [...a, ...b]");
  assert.deepEqual(k.returns, { list: "f64", max: 5 });
  same(k, [[1, 2], [3], NONE, NONE, 0, NONE], [1, 2, 3]);
  same(k, [[], [], NONE, NONE, 0, NONE], []);
  assert.match(printKernel(k), /\.\.\./);
});

test("a list plus plain items, in any order, counts each item once", () => {
  const k = ok("(a, b, z, s, n) => [n, ...a, 9, ...b]");
  assert.deepEqual(k.returns, { list: "f64", max: 7 });
  same(k, [[1, 2], [3], NONE, NONE, 0, NONE], [0, 1, 2, 9, 3]);
  assert.deepEqual(ok("(a) => [...a, 7]").returns, { list: "f64", max: 3 });
});

test("a list of max 0 adds nothing", () => {
  assert.deepEqual(ok("(a, b, z) => [...z, ...b]").returns, { list: "f64", max: 3 });
  assert.deepEqual(ok("(a, b, z) => [...z, ...z]").returns, { list: "f64", max: 0 });
  same(ok("(a, b, z) => [...z, ...b]"), [[], [4, 5], [], NONE, 0, NONE], [4, 5]);
});

test("a single spread copies, and spreads nest", () => {
  assert.deepEqual(ok("(a) => [...a]").returns, { list: "f64", max: 2 });
  const k = ok("(a, b) => [...[1, 2], ...[...a, 3], ...b]");
  assert.deepEqual(k.returns, { list: "f64", max: 8 });
  same(k, [[7], [8, 9], NONE, NONE, 0, NONE], [1, 2, 7, 3, 8, 9]);
});

test("spread literals keep their exact length, so a constant index below it is never empty", () => {
  const k = ok("(a) => { const p = [...[1, 2], ...[3]]; return p[2] + p[0]; }");
  same(k, [[], NONE, NONE, NONE, 0, NONE], 4);
  assert.deepEqual(codes("(a) => { const p = [...a, 3]; return p[2] + 1; }"), ["L003"]);
});

test("spread items are evaluated in order, and their effects count", () => {
  const k = ok("(a, b, z, s, n) => [n + 1, ...a, n + 2]");
  same(k, [[5], NONE, NONE, NONE, 10, NONE], [11, 5, 12]);
});

test("parts of different item types are one L003, with a tip", () => {
  const r = lower("(a, b, z, s) => [...a, ...s]");
  assert.deepEqual(r.diagnostics.map((d) => d.code), ["L003"]);
  assert.match(r.diagnostics[0].message, /str/);
  assert.match(r.diagnostics[0].tip ?? "", /item type/);
  assert.deepEqual(codes('(a, b, z, s) => [...a, "x"]'), ["L003"]);
  assert.deepEqual(codes("(a, b, z, s) => [...s, 1]"), ["L003"]);
});

test("a mixed-type run beside a spread is L003, as a plain mixed literal is", () => {
  assert.deepEqual(codes("(a) => [1, 'x', ...a]"), ["L003"]);
  assert.deepEqual(codes("(a) => { const p = [...a, 1, 'x']; return p; }"), ["L003"]);
  assert.deepEqual(codes("(a) => [1, 'x']"), ["L003"]);
  assert.equal(lower("(a) => [1, 'x', ...a]").kernel, null);
});

test("spreading a value that is not a list is L003", () => {
  assert.deepEqual(codes("(a, b, z, s, n) => [...n]"), ["L003"]);
  assert.deepEqual(codes("(a, b, z, s, n) => [...a, ...n]"), ["L003"]);
  const r = lower("(a, b, z, s, n) => [...n]");
  assert.match(r.diagnostics[0].tip ?? "", /list/);
});

test("spreading a possibly-empty list is refused until it is checked", () => {
  assert.deepEqual(codes("(a, b, z, s, n, o) => [...o]"), ["L003"]);
  assert.deepEqual(codes("(a, b, z, s, n, o) => { const p = o; if (p == null) return [...a]; return [...p]; }"), []);
});

test("the summed max is held where a list max is checked: a returned list", () => {
  const into3 = /** @type {Type} */ ({ list: "f64", max: 3 });
  assert.deepEqual(lower("(a, b) => [...a, ...a]", { list: "f64", max: 4 }).diagnostics, []);
  const two = lower("(a, b) => [...a, ...a]", into3);
  assert.deepEqual(two.diagnostics.map((d) => d.code), ["L003"]);
  assert.match(two.diagnostics[0].message, /\[f64; 4\]|4/);
  assert.deepEqual(lower("(a, b) => [...a, 1]", into3).diagnostics, []);
  assert.deepEqual(lower("(a, b) => [...a, 1, 2]", into3).diagnostics.map((d) => d.code), ["L003"]);
});

test("spread outside an array literal is still S109", () => {
  assert.deepEqual(codes("(a) => Math.max(...a)"), ["S109"]);
  assert.deepEqual(codes("(a) => ({ ...a })"), ["S109"]);
});

test("the IR verifier accepts a concat and refuses a wrong max or a non-list part", () => {
  const k = ok("(a, b) => [...a, 1, ...b]");
  assert.deepEqual(verify(k), []);
  const last = /** @type {any} */ (k.body.at(-1));
  const ret = last.value;
  assert.equal(ret.k, "concat");
  assert.deepEqual(verify({ ...k, body: [{ ...last, value: { ...ret, t: { list: "f64", max: 5 } } }] }).map((d) => d.code).filter((c) => c.startsWith("V")).length > 0, true);
  const nonList = { ...ret, parts: [{ k: "num", v: 1, t: "f64", span: ret.span }], t: { list: "f64", max: 1 } };
  assert.ok(verify({ ...k, body: [{ ...last, value: nonList }] }).length > 0);
});
