// A Dialect's `constants: { calls: "pure" }` lets a constant call a pure helper (Ben's ruling on iySXYx):
// fields declares it, so `.const("K", "g()")` lowers as it did when fields was hand-written; a Dialect that
// does not declare it keeps the generated const convention, which forbids every effect, a call included.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defineDialect, defineGrammar, name, lambda, exact, DefinitionError } from "../index.js";
import { field } from "../../dialects/fields/grammar.js";
import { lowerField } from "../../dialects/fields/program.js";
import { fields } from "../../dialects/fields/dialect.js";

/** @import { SlotDecl } from "../../lower/environment.js" */

const ALL_VERBS = ["read", "input", "hud", "call", "write", "bump", "rng", "emit", "sfx", "toast", "spawn", "destroy", "end", "log"];

/** A small Dialect, with `constants` as given. @param {unknown} [constants] */
const tiny = (constants) => /** @type {Record<string, any>} */ ({
  name: "tiny", numberType: "f32", text: () => "",
  spaces: { row: { pure: true } },
  targets: { js: { accepts: "*", compare: exact() } },
  slots: { keep: { params: ["f32"], returns: "f32", space: "row" } },
  ...(constants === undefined ? {} : { constants }),
});

/** A Grammar over `dialect` with helpers, constants and one `keep` lambda. @param {any} dialect */
const grammarOver = (dialect) => defineGrammar(dialect, {
  root: "c",
  constructs: { c: { opens: [name()], slots: { fn: { kind: "unit", unit: "fn" }, const: { kind: "unit", unit: "const" }, keep: { kind: "decl", args: [lambda("keep")], once: true, required: true } } } },
});

/** Every diagnostic lowering `record` gives, lambdas and units both, as "code message". @param {any} g @param {any} record @returns {string[]} */
const diagnostics = (g, record) => g.lower(record).diagnostics.map((/** @type {any} */ d) => `${d.code} ${d.message}`);

/** The const convention a Dialect's Environment gives. @param {any} d @returns {SlotDecl} */
const constSlot = (d) => /** @type {SlotDecl} */ (d.environment({}).slot({ id: "K", kind: "const", on: "$", key: "K" }));

// Changed in hxjaI2: with `() => 2` this passed while the constant was typed unknown, which any use accepts. A
// vec2 helper shows the constant typed by its helper: its components lower, and the vector as a channel does not.
test("a fields constant may call a pure helper again, and has the helper's type", () => {
  const r = lowerField(field("c").fn("g", "() => vec2(0.25, 0.5)").const("K", "g()").pixel("(uv, u) => color(K.x, K.y, 0)").build());
  assert.deepEqual(r.diagnostics.map((d) => `${d.code} ${d.message}`), []);
  assert.ok(r.kernel);
  const wrong = lowerField(field("c").fn("g", "() => vec2(0.25, 0.5)").const("K", "g()").pixel("(uv, u) => color(K, 0, 0)").build());
  assert.ok(wrong.diagnostics.some((d) => d.code === "L003"));
});

test("the const convention forbids every effect but a call when a Dialect declares pure calls", () => {
  assert.deepEqual([...constSlot(fields).forbid].sort(), ALL_VERBS.filter((v) => v !== "call").sort());
  assert.match(String(constSlot(fields).forbidWhy), /pure helpers/);
  const pure = defineDialect(/** @type {any} */ (tiny({ calls: "pure" })));
  assert.deepEqual([...constSlot(pure).forbid].sort(), ALL_VERBS.filter((v) => v !== "call").sort());
  // Without the declaration, or with calls: "none", nothing changes: every effect, a call included, is forbidden.
  for (const constants of [undefined, { calls: "none" }]) {
    const d = defineDialect(/** @type {any} */ (tiny(constants)));
    assert.deepEqual([...constSlot(d).forbid].sort(), [...ALL_VERBS].sort());
  }
});

test("a constant calling a helper lowers where the Dialect declares pure calls, and is L004 where it does not", () => {
  const record = (/** @type {any} */ g) => g("c").fn("g", "() => 2").const("K", "g()").keep("(x) => x + K").build();
  const pure = grammarOver(defineDialect(/** @type {any} */ (tiny({ calls: "pure" }))));
  assert.deepEqual(diagnostics(pure, record(pure)), []);
  const plain = grammarOver(defineDialect(/** @type {any} */ (tiny())));
  assert.ok(diagnostics(plain, record(plain)).some((d) => /^L004 .*call g/.test(d)), "still refused without the declaration");
});

test("a bad constants declaration is refused with D011, an unknown key with D001", () => {
  /** @param {unknown} constants */
  const codes = (constants) => {
    try { defineDialect(/** @type {any} */ (tiny(constants))); return []; } catch (e) {
      assert.ok(e instanceof DefinitionError);
      return e.diagnostics.map((d) => d.code);
    }
  };
  assert.deepEqual(codes({ calls: "maybe" }), ["D011"]);
  assert.deepEqual(codes(true), ["D011"]);
  assert.deepEqual(codes({ calls: "pure", reads: "all" }), ["D001"]);
});

test("L004's tip is the Dialect's reason, with no DMG handler named", () => {
  const plain = grammarOver(defineDialect(/** @type {any} */ (tiny())));
  const d = /** @type {any} */ (plain.lower(plain("c").fn("g", "() => 2").const("K", "g()").keep("(x) => x + K").build()).diagnostics.find((/** @type {any} */ x) => x.code === "L004"));
  assert.match(d.tip, /computed once/);
  assert.doesNotMatch(d.tip, /onFrame|event handler/);
});
