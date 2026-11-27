// A list's length is typed as the Dialect's number type when that type holds the list's max exactly, else f64 (the
// verifier's rule, kit/ir/verify.js). An f32 Dialect's open state list (max OPEN_MAX, kit/define/ui/lower.js) reads
// its length as an f64, in a UI lambda and in a port's output lambda alike; and an f32 counter is not accepted
// against a length it cannot count to. The workbench here is an FM synth, not a founding example.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defineDialect, defineGrammar, defineUI, run, exact, struct, list, name, lambda } from "../../define/index.js";
import { verify } from "../../ir/verify.js";

/** @import { Kernel } from "../../ir/ir.js" */

/**
 * An FM synth Dialect with an open list of voices and a list of at most 8 envelope stages, and one slot taking a list
 * of at most `max` samples.
 * @param {"f32" | "f64"} numberType @param {Record<string, any>} [ports] @param {number} [max]
 */
function synth(numberType, ports = undefined, max = 8) {
  const dialect = defineDialect(/** @type {any} */ ({
    name: "synth",
    numberType,
    spaces: { s: { pure: true } },
    targets: { js: { accepts: "*", compare: exact() } },
    slots: { onBlock: { params: [list(numberType, max)], returns: numberType, space: "s" } },
    text: () => "",
    state: { t: numberType, voices: /** @type {any} */ (list)(struct({ freq: numberType })), stages: list(numberType, 8) },
    ...(ports ? { ports: { out: ports } } : {}),
  }));
  const grammar = defineGrammar(dialect, { root: "patch", constructs: { patch: { opens: [name()], slots: { block: { kind: "decl", args: [name("c"), lambda("onBlock")] } } } } });
  return grammar;
}

/**
 * Lowers one UI stat whose value is `fn` against an empty patch.
 * @param {"f32" | "f64"} numberType @param {(s: any) => unknown} fn
 */
function stat(numberType, fn) {
  const grammar = synth(numberType);
  const { record } = run(() => grammar("o"));
  const ui = defineUI(grammar, { tiles: { voices: { title: "Voices", place: { splitBelow: "stage" }, body: [{ kind: "stat", label: "n", value: fn }] } } });
  const r = ui.lower(/** @type {any} */ (record));
  return { codes: r.diagnostics.map((d) => `${d.code} ${d.message}`), kernel: /** @type {Kernel | undefined} */ (Object.values(r.kernels)[0]), ui, record };
}

test("an f32 Dialect's UI lambda reads an open list's length, as an f64, and its Kernel verifies", () => {
  const { codes, kernel } = stat("f32", (s) => s.voices.length);
  assert.deepEqual(codes, []);
  assert.ok(kernel);
  assert.deepEqual(verify(kernel, { partial: true }), []);
  assert.equal(kernel.returns, "f64");
});

test("an f32 Dialect's UI lambda compares an open list's length to a literal", () => {
  const { codes, kernel } = stat("f32", (s) => (s.voices.length > 3 ? 1 : 0));
  assert.deepEqual(codes, []);
  assert.ok(kernel);
});

test("an f32 Dialect's UI lambda reads a short list's length as an f32, and so computes in f32", () => {
  const { codes, kernel, ui, record } = stat("f32", (s) => s.stages.length / 3);
  assert.deepEqual(codes, []);
  assert.ok(kernel);
  assert.equal(kernel.returns, "f32");
  const value = ui.compile(/** @type {any} */ (record)).evaluate({ t: 0, voices: [], stages: [1, 2] }, {}).tiles[0].body[0].value;
  assert.equal(value, Math.fround(2 / 3));
});

test("an f64 Dialect's UI lambda reads an open list's length as an f64", () => {
  const { codes, kernel } = stat("f64", (s) => s.voices.length);
  assert.deepEqual(codes, []);
  assert.equal(kernel?.returns, "f64");
});

test("an f32 Dialect's port output reads an open list's length as an f64", () => {
  const ok = synth("f32", { voices: { seam: "f64", from: (/** @type {any} */ s) => s.voices.length, note: "voices sounding" } });
  const low = /** @type {any} */ (ok.lower(ok("o").build()));
  assert.deepEqual(low.diagnostics.filter((/** @type {any} */ d) => d.severity === "error").map((/** @type {any} */ d) => d.code), []);
  assert.equal(low.seams.outputs.voices.returns, "f64");
});

/**
 * Lowers one lambda in the synth's block slot, whose list has at most `max` items.
 * @param {"f32" | "f64"} numberType @param {number} max @param {string} src
 */
function block(numberType, max, src) {
  const g = synth(numberType, undefined, max);
  const r = g.lower(g("x").block("l", src).build());
  return { codes: r.diagnostics.filter((d) => d.severity === "error").map((d) => d.code), kernel: /** @type {Kernel | undefined} */ (r.lambdas[0]?.result?.kernel) };
}

test("an f32 Dialect's list of max 2^24 has an f32 length; one of max 2^24 + 1 an f64, and the Kernel verifies", () => {
  const short = block("f32", 2 ** 24, "(xs) => xs.length");
  assert.deepEqual(short.codes, []);
  assert.equal(short.kernel?.returns, "f32");
  const long = block("f32", 2 ** 24 + 1, "(xs) => { const n = xs.length; return n > 0 ? 1 : 0; }");
  assert.deepEqual(long.codes, []);
  assert.ok(long.kernel);
  assert.deepEqual(verify(long.kernel), []);
});

test("an f32 counter is refused against a length past what it counts to exactly (L-code, not a dropped Kernel)", () => {
  const loop = "(xs) => { let s = 0; for (let i = 0; i < xs.length; i++) { s += xs[i]; } return s; }";
  const long = block("f32", 2 ** 25, loop);
  assert.ok(!long.kernel);
  assert.ok(long.codes.length > 0 && long.codes.every((c) => c.startsWith("L")), long.codes.join());
  const edge = block("f32", 2 ** 24, loop);
  assert.ok(edge.codes.includes("L007"), `a bound of 2^24 is past an f32 counter's exact range: ${edge.codes.join()}`);
  const ok = block("f32", 2 ** 24 - 1, loop);
  assert.deepEqual(ok.codes, []);
  assert.deepEqual(verify(/** @type {Kernel} */ (ok.kernel)), []);
  assert.deepEqual(block("f64", 2 ** 25, loop).codes, [], "an f64 counter counts that far");
});
