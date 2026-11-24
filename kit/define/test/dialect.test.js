// defineDialect: the fields worked example yields the hand-written fields Environment, intrinsic table
// and Library; a bad definition is refused with a D… code naming the declaration and the fix.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fields } from "../examples/fields.js";
import { defineDialect, vector, exact, tolerance, scalar, object, opt, list, DefinitionError, DEFINE_CODES } from "../index.js";
import { fieldsEnvironment, INTRINSICS, LIBRARY, libraryFor } from "../../dialects/fields/index.js";
import { swirl, bulge } from "../../dialects/fields/programs/uv-remaps.js";
import { swirlCalls, bulgeCalls } from "../../dialects/fields/programs/uv-remaps-calls.js";
import { domainWarp } from "../../dialects/fields/programs/domain-warp.js";
import { domainWarpCalls } from "../../dialects/fields/programs/domain-warp-calls.js";

/** @import { FieldProgram } from "../../dialects/fields/decls.js" */

/** Every fields sketch in the repo, plus the params the tests use (sizes, choices, toggles, none). */
const PROGRAMS = /** @type {FieldProgram[]} */ ([
  swirl, bulge, swirlCalls, bulgeCalls, domainWarp, domainWarpCalls,
  { name: "none", params: {}, units: [], pixel: "" },
  { name: "mixed", params: { n: { value: 4, min: 0, max: 100 }, big: { value: 1, min: 0, max: 16777215.5 }, on: { value: true }, pick: { value: "a", options: ["a", "b"] } }, units: [], pixel: "" },
]);

/** What the generated `const` convention forbids, and fields' does not (the design doc, decision record). */
const ALL_VERBS = ["read", "input", "hud", "call", "write", "rng", "emit", "sfx", "toast", "spawn", "destroy", "end", "log"];

test("the fields Environment equals fieldsEnvironment(params) for every sketch", () => {
  for (const p of PROGRAMS) {
    const want = fieldsEnvironment(p.params);
    const got = fields.environment(p);
    for (const k of /** @type {const} */ (["name", "objects", "globals", "vectors", "componentAliases", "numberType", "conversions", "list", "queries"])) {
      assert.deepEqual(got[k], want[k], `${p.name}: ${k}`);
    }
    for (const ref of [{ id: `${p.name}.pixel`, kind: "pixel", on: p.name }, { id: "ring", kind: "helper", on: "$", key: "ring" }]) {
      assert.deepEqual(got.slot(ref), want.slot(ref), `${p.name}: slot ${ref.kind}`);
    }
    // The one known difference: the generated const convention forbids every effect; fields' forbids none.
    const cref = { id: "K", kind: "const", on: "$", key: "K" };
    const { forbid, forbidWhy, ...rest } = /** @type {import("../../lower/environment.js").SlotDecl} */ (got.slot(cref));
    const { forbid: fieldsForbid, ...fieldsRest } = /** @type {import("../../lower/environment.js").SlotDecl} */ (want.slot(cref));
    assert.deepEqual(rest, fieldsRest);
    assert.deepEqual(fieldsForbid, []);
    assert.deepEqual([...forbid].sort(), [...ALL_VERBS].sort());
    assert.match(String(forbidWhy), /computed once/);
    assert.equal(typeof got.slot({ id: "x", kind: "row", on: "x" }), "string", "an undeclared convention is a reason, not a convention");
  }
});

test("the intrinsic table and the Library are fields' own", () => {
  assert.deepEqual(fields.intrinsics, INTRINSICS);
  assert.deepEqual(fields.library, LIBRARY);
  const src = "(uv, u) => color(fbm(uv, 1), pmod(1, 2), 0)";
  assert.deepEqual(fields.libraryFor([src]), libraryFor([src]));
  assert.deepEqual(fields.targets, { js: { accepts: "*", compare: { kind: "exact" } }, glsl: { accepts: ["pixel"], compare: { kind: "tolerance", figure: 1e-3 } } });
});

/** A small valid definition each refusal test breaks in one place. */
const base = () => /** @type {Record<string, any>} */ ({
  name: "tiny", numberType: "f32",
  types: { vec2: vector(2, "f32") },
  spaces: { pixel: { pure: true } },
  objects: { U: { label: "the uniforms", members: { t: "f32" } } },
  intrinsics: { sin: { params: ["f32"], returns: "f32", ref: Math.sin, spell: { js: "Math.sin($0)", glsl: "sin($0)" } } },
  library: { half: { fn: "(x) => x * 0.5" } },
  targets: { js: { accepts: "*", compare: exact() }, glsl: { accepts: ["pixel"], compare: tolerance(1e-3) } },
  slots: { pixel: { params: ["vec2", "U"], returns: "f32", space: "pixel" } },
});

/**
 * The codes a definition is refused with, and the first diagnostic.
 * @param {(d: Record<string, any>) => void} edit
 */
function refused(edit) {
  const def = base();
  edit(def);
  try { defineDialect(/** @type {any} */ (def)); } catch (e) {
    assert.ok(e instanceof DefinitionError, String(e));
    for (const d of e.diagnostics) { assert.ok(d.message.length > 0 && d.tip.length > 0, d.code); assert.ok(Array.isArray(d.path)); }
    return { codes: e.diagnostics.map((d) => d.code), first: e.diagnostics[0] };
  }
  return { codes: [], first: null };
}

test("a valid definition is accepted", () => {
  assert.deepEqual(refused(() => {}).codes, []);
});

test("each bad definition is refused with its D code, naming the declaration and the fix", () => {
  /** @type {Array<[string, (d: Record<string, any>) => void, RegExp]>} */
  const cases = [
    ["D001", (d) => { d.intrinsic = {}; }, /intrinsic.*Did you mean 'intrinsics'/],
    ["D001", (d) => { delete d.targets; }, /targets/],
    ["D002", (d) => { d.slots.pixel.returns = "colour"; }, /'colour'/],
    ["D003", (d) => { delete d.intrinsics.sin.spell.glsl; }, /sin.*'glsl'/],
    ["D004", (d) => { delete d.intrinsics.sin.ref; }, /sin.*ref/],
    ["D005", (d) => { d.slots.pixel.space = "pixl"; }, /pixl.*Did you mean 'pixel'/],
    ["D006", (d) => { d.targets.glsl.accepts = ["row"]; }, /glsl.*row/],
    ["D007", (d) => { d.library.sin = { fn: "(x) => x" }; }, /'sin'/],
    ["D007", (d) => { d.slots.helper = { params: [], returns: "f32", space: "pixel" }; }, /'helper'/],
    ["D008", (d) => { d.targets.glsl.compare = tolerance(0); }, /glsl/],
    ["D011", (d) => { d.types.vec2 = vector(5, "f32"); }, /vec2/],
    ["D012", (d) => { d.spaces.pixel = { pure: false }; }, /pixel.*pure/],
    ["D013", (d) => { d.library.half = { fn: "(x) => {" }; }, /half/],
    ["D016", (d) => { d.types.date = scalar("f64", { note: "ms" }); }, /date.*not built yet/],
  ];
  for (const [code, edit, message] of cases) {
    const { codes, first } = refused(edit);
    assert.deepEqual(codes, [code], code);
    assert.match(String(first?.message), message, code);
  }
});

test("every problem is collected, not only the first", () => {
  assert.deepEqual(refused((d) => { d.spaces.pixel = { pure: false }; d.slots.pixel.space = "nowhere"; }).codes.sort(), ["D005", "D012"]);
});

test("every define code is exercised by these tests or the grammar's", () => {
  assert.deepEqual(Object.keys(DEFINE_CODES).filter((c) => c.startsWith("D")), ["D001", "D002", "D003", "D004", "D005", "D006", "D007", "D008", "D009", "D010", "D011", "D012", "D013", "D014", "D015", "D016"]);
});

test("a convention may be a function of (ref, program, state); a string refuses the slot", () => {
  /** @type {unknown[]} */
  const seen = [];
  const def = base();
  def.slots.row = (/** @type {any} */ ref, /** @type {any} */ program, /** @type {any} */ state) => {
    seen.push([ref.kind, program.name, state]);
    if (ref.key === "no") return "not this one";
    return { params: [object("a row", state.columns), opt(list("f32", 8))], returns: "infer", space: "pixel" };
  };
  const d = defineDialect(/** @type {any} */ (def));
  const states = new Map([["t.row#0", { columns: { price: "f32", label: "str" } }]]);
  const env = d.environment({ name: "prog" }, states);
  const conv = /** @type {import("../../lower/environment.js").SlotDecl} */ (env.slot({ id: "t.row#0", kind: "row", on: "t" }));
  assert.deepEqual(seen, [["row", "prog", { columns: { price: "f32", label: "str" } }]]);
  const row = /** @type {{ obj: string }} */ (conv.params[0]);
  assert.deepEqual(env.objects[row.obj], { label: "a row", members: { price: { kind: "value", t: "f32" }, label: { kind: "value", t: "str" } } });
  assert.deepEqual(conv.params[1], { opt: { list: "f32", max: 8 } });
  assert.equal(conv.returns, "infer");
  assert.equal(env.slot({ id: "t.row#1", kind: "row", on: "t", key: "no" }), "not this one");
});

test("the environment hook merges members; a name it declares twice is refused", () => {
  const def = base();
  def.environment = () => ({ objects: { U: { members: { t: "f32" } } } });
  assert.throws(() => defineDialect(/** @type {any} */ (def)).environment({ name: "p" }), /U\.t.*twice|twice.*U\.t/);
  def.environment = () => ({ objects: { U: { members: { k: "bool" } }, P: { label: "the params ($)", members: { n: "f32" } } }, globals: { $: "P" } });
  const env = defineDialect(/** @type {any} */ (def)).environment({ name: "p" });
  assert.deepEqual(env.objects.U.members, { t: { kind: "value", t: "f32" }, k: { kind: "value", t: "bool" } });
  assert.deepEqual(env.globals.$, { obj: "P" });
});
