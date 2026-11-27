// The IR verifier on its own, with no lowering narrowing to lean on ("Loop-index reads" in the README): a non-empty
// `xs[i]` is accepted only inside a loop that counts to xs.length from zero or above, with xs left alone. Each case
// takes a lowered Kernel and edits it. From the review of ce1e7b4 (leaf uyQknP).
import { test } from "node:test";
import assert from "node:assert/strict";
import { defineDialect, defineGrammar, exact, list, lambda, name } from "../../define/index.js";
import { verify } from "../verify.js";

/** @import { Kernel, Stmt } from "../ir.js" */

const g = defineGrammar(defineDialect({
  name: "loopindex", numberType: "f64", types: {},
  spaces: { calc: { pure: true } }, targets: { js: { accepts: "*", compare: exact() } },
  slots: { onTwo: { params: [list("f64", 8), list("f64", 8)], returns: "f64", space: "calc" } },
  text: () => "",
}), { root: "p", constructs: { p: { opens: [name()], slots: { two: { kind: "decl", args: [name("c"), lambda("onTwo")] } } } } });

const SUM = "(xs, ys) => { let s = 0; for (let i = 0; i < xs.length; i++) { s += xs[i]; } return s; }";

/** A fresh copy of SUM's Kernel. @returns {any} */
function kernel() {
  const r = g.lower(/** @type {any} */ (g("x")).two("l", SUM).build());
  assert.deepEqual(r.diagnostics.filter((d) => d.severity === "error"), []);
  return structuredClone(/** @type {Kernel} */ (r.lambdas[0].result.kernel));
}
/** @param {any} k */
const codes = (k) => verify(/** @type {Kernel} */ (k)).map((d) => d.code);
/** @param {any} k */
const findFor = (k) => k.body.find((/** @type {Stmt} */ s) => s.k === "for");

test("the narrowed read verifies", () => assert.deepEqual(codes(kernel()), []));

test("the narrowed read with the loop's start made -1 is refused", () => {
  const k = kernel();
  findFor(k).init = { ...findFor(k).init, v: -1 };
  assert.ok(codes(k).includes("V002"), codes(k).join());
});

test("the narrowed read with the list pushed in the body is refused", () => {
  const k = kernel();
  const f = findFor(k);
  f.body.push({ k: "push", name: "xs", value: { k: "num", v: 1, t: "f64", span: f.span }, span: f.span, effects: [] });
  assert.ok(codes(k).includes("V002"), codes(k).join());
});

test("the narrowed read of another list than the loop counts to is refused", () => {
  const k = JSON.parse(JSON.stringify(kernel()).replace('"of":{"k":"local","name":"xs"', '"of":{"k":"local","name":"ys"'));
  assert.ok(codes(k).includes("V002"), codes(k).join());
});

test("the narrowed read with the test made <= is refused", () => {
  const k = kernel();
  findFor(k).test.op = "le";
  assert.ok(codes(k).includes("V002"), codes(k).join());
});

test("the narrowed read moved after the loop is refused", () => {
  const k = kernel();
  const f = findFor(k);
  const read = f.body.find((/** @type {Stmt} */ s) => JSON.stringify(s).includes('"k":"index"'));
  k.body.splice(k.body.indexOf(f) + 1, 0, structuredClone(read));
  assert.ok(codes(k).length > 0, "accepted a narrowed read outside its loop");
});
