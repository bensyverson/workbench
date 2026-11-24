// The per-node hook the pixel debugger builds on: every node evaluated reports its kind, span,
// value and path, in the order the interpreter finished them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { run } from "../index.js";
import { num, op, local, let_, ret, if_, for_, set, kernel, helper, vec, f32, field, bool } from "./build.js";

/** @import { NodeEvent } from "../interp.js" */

/**
 * @param {import("../../ir/ir.js").Kernel} k
 * @param {unknown[]} inputs
 * @param {object} [env]
 */
function trace(k, inputs, env = {}) {
  /** @type {NodeEvent[]} */
  const events = [];
  const result = run(k, inputs, { ...env, onNode: (e) => events.push(e) });
  return { events, result };
}

/** An expression with distinct spans, so each event can be told apart. */
const at = (/** @type {import("../../ir/ir.js").Expr} */ e, /** @type {[number, number]} */ span) => ({ ...e, span });

test("an event carries kind, span, value, path and the kernel's name", () => {
  const k = kernel({ name: "k#0", params: [["a", "f64"]], returns: "f64", body: [ret(op("add", "f64", at(local("a"), [3, 4]), at(num(2), [7, 8])))] });
  const { events, result } = trace(k, [5]);
  assert.equal(result, 7);
  const byPath = Object.fromEntries(events.map((e) => [e.path, e]));
  assert.deepEqual({ kind: byPath["body[0].value.args[0]"].kind, span: byPath["body[0].value.args[0]"].span, value: byPath["body[0].value.args[0]"].value }, { kind: "local", span: [3, 4], value: 5 });
  assert.deepEqual({ kind: byPath["body[0].value.args[1]"].kind, value: byPath["body[0].value.args[1]"].value }, { kind: "num", value: 2 });
  assert.equal(byPath["body[0].value"].kind, "op");
  assert.equal(byPath["body[0].value"].value, 7);
  assert.equal(byPath["body[0].value"].kernel, "k#0");
  assert.equal(byPath["body[0]"].kind, "return");
  assert.equal(byPath["body[0]"].stmt, true);
  assert.equal(byPath["body[0].value"].stmt, false);
});

test("operands finish before the operator, and a statement after its expressions", () => {
  const k = kernel({ params: [["a", "f64"]], returns: "f64", body: [ret(op("add", "f64", local("a"), num(2)))] });
  const { events } = trace(k, [5]);
  assert.deepEqual(events.map((e) => e.path), ["body[0].value.args[0]", "body[0].value.args[1]", "body[0].value", "body[0]"]);
});

test("a statement reports the value it handled: let and set the value, return what it returned", () => {
  const k = kernel({ returns: "f64", body: [let_("t", "f64", num(1)), set("t", num(2)), ret(local("t"))] });
  const stmts = trace(k, []).events.filter((e) => e.stmt);
  assert.deepEqual(stmts.map((e) => [e.kind, e.value]), [["let", 1], ["set", 2], ["return", 2]]);
});

test("a branch not taken reports nothing; a loop reports each pass", () => {
  const k = kernel({ params: [["a", "f64"]], returns: "f64", body: [if_(op("gt", "bool", local("a"), num(0)), [ret(num(1))], [ret(num(2))])] });
  const paths = trace(k, [5]).events.map((e) => e.path);
  assert.ok(paths.includes("body[0].then[0]"));
  assert.ok(!paths.some((p) => p.startsWith("body[0].else")));
  const loop = kernel({ body: [for_("i", 3, [])] });
  const tests = trace(loop, []).events.filter((e) => e.path === "body[0].test");
  assert.deepEqual(tests.map((e) => e.value), [true, true, true, false]);
});

test("vector values are reported as the arrays the interpreter holds", () => {
  const k = kernel({ returns: "f32", body: [ret(field(vec([f32(1), f32(2)], "f32", "vec2"), "y", "f32"))] });
  const events = trace(k, []).events;
  assert.deepEqual(events.find((e) => e.kind === "vec")?.value, [1, 2]);
  assert.equal(events.find((e) => e.kind === "field")?.value, 2);
});

test("a helper's nodes are reported under the helper's own name, one level deeper", () => {
  const inc = kernel({ name: "inc", params: [["x", "f64"]], returns: "f64", body: [ret(op("add", "f64", local("x"), num(1)))] });
  const k = kernel({ name: "main", returns: "f64", body: [ret(helper("inc", "f64", [num(1)]))] });
  const { events } = trace(k, [], { helpers: { inc } });
  const inner = events.filter((e) => e.kernel === "inc");
  assert.ok(inner.length >= 3);
  assert.ok(inner.every((e) => e.depth === 1));
  assert.ok(events.filter((e) => e.kernel === "main").every((e) => e.depth === 0));
  assert.deepEqual(events.at(-1)?.kernel, "main", "the caller's return is last");
});

test("the hook cannot change the run: its result is the same with and without it", () => {
  const k = kernel({ returns: "f32", body: [ret(op("mul", "f32", f32(0.1), f32(3)))] });
  assert.equal(trace(k, []).result, run(k, []));
});

test("a hook that throws stops the run with its error", () => {
  const k = kernel({ returns: "bool", body: [ret(bool(true))] });
  assert.throws(() => run(k, [], { onNode: () => { throw new Error("stop here"); } }), /stop here/);
});
