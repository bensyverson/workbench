// A constant that calls a helper (review of 62bec66, job hxjaI2, findings 2 and 3). Constants were lowered
// before helper signatures were inferred, so a call in one was typed unknown (type errors passed through it), a
// chain const → g → h threw, and a helper called only from a constant had no call site, so `h(0.25)` was L014 and
// `J + 1` after `const J = g()` mixed f32 with f64. Constants are now lowered in the inference passes and their
// calls count as call sites. From the reviewer's probes local/rev-data-probes/{const-types,fields-const}.probe.js.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defineDialect, defineGrammar, name, lambda, exact } from "../index.js";
import { field } from "../../dialects/fields/grammar.js";
import { lowerField } from "../../dialects/fields/program.js";
import { runCase } from "../../harness/index.js";

const tiny = defineDialect({
  name: "tiny", numberType: "f32", text: () => "", constants: { calls: "pure" },
  spaces: { row: { pure: true } },
  targets: { js: { accepts: "*", compare: exact() } },
  slots: { keep: { params: ["f32"], returns: "f32", space: "row" } },
});
const g = defineGrammar(tiny, {
  root: "c",
  constructs: { c: { opens: [name()], slots: { fn: { kind: "unit", unit: "fn" }, const: { kind: "unit", unit: "const" }, keep: { kind: "decl", args: [lambda("keep")], once: true } } } },
});
/** Every diagnostic lowering a record gives, as "code message". @param {any} b */
const diags = (b) => g.lower(b.build()).diagnostics.map((/** @type {any} */ d) => `${d.code} ${d.message}`);
/** @param {any} p */
const fieldDiags = (p) => { const r = lowerField(p); return r.diagnostics.map((d) => `${d.code} ${d.message}`); };

test("a constant carries its helper's type: a string helper's value is no f32", () => {
  assert.ok(diags(g("c").fn("s", '() => "a"').const("K", "s()").keep("(x) => x + K")).some((d) => d.startsWith("L003")));
});

test("a fields constant from a vec3 helper is no color channel", () => {
  assert.ok(fieldDiags(field("c").fn("g", "() => vec3(1, 2, 3)").const("K", "g()").pixel("(uv, u) => color(K, 0, 0)").build()).some((d) => d.startsWith("L003")));
});

test("a helper chain reached from a constant lowers, with the inner helper's parameter typed by its call", () => {
  assert.deepEqual(diags(g("c").fn("h", "(a) => a * 2").fn("g", "() => h(3)").const("K", "g()").keep("(x) => x + K")), []);
  assert.deepEqual(fieldDiags(field("c").fn("h", "(a) => a * 2").fn("g", "() => h(0.5)").const("K", "g()").pixel("(uv, u) => color(K, 0, 0)").build()), []);
});

test("a helper called only from a constant has its parameter typed by that call", () => {
  assert.deepEqual(diags(g("c").fn("h", "(a) => a * 2").const("K", "h(3)").keep("(x) => x + K")), []);
  assert.deepEqual(fieldDiags(field("c").fn("h", "(a) => a * 2").const("K", "h(0.25)").pixel("(uv, u) => color(K, 0, 0)").build()), []);
});

test("a constant built from a constant that calls a helper keeps the Dialect's number type", () => {
  assert.deepEqual(diags(g("c").fn("g", "() => 2").const("J", "g()").const("K", "J + 1").keep("(x) => x + K")), []);
});

test("a fields constant calling a helper runs the same in the interpreter and the emitted JS, and the GLSL holds the helper", async () => {
  const program = field("c").fn("h", "(a) => a * 2").fn("g", "() => h(0.25)").const("K", "g()").pixel("(uv, u) => color(K, uv.x, 0)").build();
  const r = await runCase({ name: "const calls", program, width: 4, height: 2, sets: [{ label: "t 0", values: { t: 0, aspect: 2 } }] });
  assert.equal(r.jsVsInterp.exact, true);
  const { prepare } = await import("../../harness/index.js");
  const glsl = /** @type {string} */ (prepare(program).glsl.source);
  assert.match(glsl, /\bg\(/);
  assert.match(glsl, /\bh\(/);
});
