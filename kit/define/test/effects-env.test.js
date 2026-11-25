// Per-slot effects in the generated Environment and through a Grammar's lower(): a writable member gets the value
// store rule and a read effect, a total `bump` and a read effect, a verb and a callable object their effects; each
// slot gets `may` (an instance space's slots may also read their instance); helpers read instance objects only
// unless `helpers.may` says more; and lowering then judges every lambda (L004, L013, L017) as the spec says.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defineDialect, defineGrammar, exact, name, lambda } from "../index.js";
import { gardenDef, gardenGrammar } from "../fixtures/garden-dialect.js";
import { fields } from "../../dialects/fields/dialect.js";

/** @import { SlotDecl } from "../../lower/environment.js" */

const garden = defineDialect(/** @type {any} */ (gardenDef()));
const g = gardenGrammar(garden);
const env = garden.environment({ total: { harvest: {} }, param: { rate: {} } });

/** @param {string} kind @returns {SlotDecl} */
const slot = (kind) => /** @type {SlotDecl} */ (env.slot({ id: `g.${kind}`, kind, on: "g", ...(kind === "helper" ? { key: "h" } : {}) }));

test("a writable member stores with the value rule and records a read; a read-only one has neither", () => {
  assert.deepEqual(env.objects.Plant.members.height, { kind: "value", t: "f64", store: { type: "value" }, effect: "read Plant.height" });
  const spot = /** @type {any} */ (env.objects.Plant.members.spot);
  assert.deepEqual([spot.store, spot.effect], [{ type: "value" }, "read Plant.spot"]);
  assert.deepEqual(env.objects.Plant.members.age, { kind: "value", t: "f64" });
});

test("a total environment(program) adds is a bump with a read effect, and no store", () => {
  assert.deepEqual(env.objects.Totals.members.harvest, { kind: "value", t: "f64", bump: true, effect: "read Totals.harvest" });
});

test("a verb carries its effects, and an object's call becomes ObjectDecl.call with its effects", () => {
  assert.deepEqual(env.objects.Plant.members.wilt, { kind: "fn", params: [], returns: "void", effects: ["destroy Plant"] });
  assert.deepEqual(env.objects.Rng.call, { params: [], returns: "f64", effects: ["rng"] });
  assert.deepEqual(env.objects.Rng.members, {});
});

test("each slot's may: as declared, plus a read of its instance in an instance space", () => {
  assert.deepEqual(slot("rain").may, ["read Totals"]);
  assert.deepEqual(slot("grow").may, ["write Plant", "destroy Plant", "bump Totals", "read Plant"]);
  assert.deepEqual(slot("sow").may, ["write Plant.water", "write Plant.spot", "rng", "read Plant"]);
});

test("a slot that says nothing may do nothing: may is [] in a pure space, and only its instance's read in an instance space", () => {
  const def = gardenDef();
  delete def.slots.rain.may;
  delete def.slots.sow.may;
  const e = defineDialect(/** @type {any} */ (def)).environment({});
  assert.deepEqual(/** @type {SlotDecl} */ (e.slot({ id: "r", kind: "rain", on: "g" })).may, []);
  assert.deepEqual(/** @type {SlotDecl} */ (e.slot({ id: "s", kind: "sow", on: "g" })).may, ["read Plant"]);
});

test("the helper convention: helpers.may when given, else a read of each instance space's object", () => {
  assert.deepEqual(slot("helper").may, ["read Plant"]);
  const def = gardenDef();
  delete def.helpers;
  def.objects.Bed = { label: "a bed", members: {} };
  def.spaces.bed = { instance: "Bed" };
  def.slots.tend = { params: ["Bed"], returns: "void", space: "bed" };
  const e = defineDialect(/** @type {any} */ (def)).environment({});
  assert.deepEqual(/** @type {SlotDecl} */ (e.slot({ id: "h", kind: "helper", on: "$", key: "h" })).may, ["read Plant", "read Bed"]);
  const wide = gardenDef();
  wide.helpers = { may: ["read Plant", "read Totals"] };
  assert.deepEqual(/** @type {SlotDecl} */ (defineDialect(/** @type {any} */ (wide)).environment({}).slot({ id: "h", kind: "helper", on: "$", key: "h" })).may, ["read Plant", "read Totals"]);
});

test("a Dialect with only pure spaces gets may [] on every slot and helper, so fields stays pure as before", () => {
  const e = fields.environment({ name: "p", params: {} });
  assert.deepEqual(/** @type {SlotDecl} */ (e.slot({ id: "p.pixel", kind: "pixel", on: "p" })).may, []);
  assert.deepEqual(/** @type {SlotDecl} */ (e.slot({ id: "h", kind: "helper", on: "$", key: "h" })).may, []);
});

test("a convention function's may reaches its SlotDecl, with the instance read", () => {
  const def = gardenDef();
  def.slots.grow = () => ({ params: ["Plant", "f64"], returns: "void", space: "plant", may: ["write Plant.height"] });
  const e = defineDialect(/** @type {any} */ (def)).environment({});
  assert.deepEqual(/** @type {SlotDecl} */ (e.slot({ id: "g", kind: "grow", on: "g" })).may, ["write Plant.height", "read Plant"]);
});

/** Lowers a garden Program and returns its error codes, lambdas' and helpers' together. @param {(b: any) => any} build */
function lowered(build) {
  const r = g.lower(build(g("beds").total("harvest").total("grown")).build());
  return r.diagnostics.filter((/** @type {any} */ d) => d.severity === "error").map((/** @type {any} */ d) => `${d.code}${d.unit ? `@${d.unit}` : ""}`);
}

test("a Program using every allowed effect lowers clean", () => {
  assert.deepEqual(lowered((b) => b
    .fn("tall", "(pl) => pl.height > 2")
    .rain("(t) => totals.harvest < 10 ? 1 : 0")
    .grow("(pl, dt) => { pl.height += dt * pl.water; totals.grown++; if (tall(pl)) { pl.wilt(); totals.harvest += pl.height; } }")
    .sow("(pl, rng) => { pl.water = rng(); pl.spot = vec2(rng() * 10, pl.spot.y); }")), []);
});

for (const [why, build, codes] of /** @type {Array<[string, (b: any) => any, string[]]>} */ ([
  ["a write the slot may not make is L004", (b) => b.sow("(pl, rng) => { pl.height = 1; }"), ["L004"]],
  ["a verb the slot may not call is L004", (b) => b.sow("(pl, rng) => { pl.wilt(); }"), ["L004"]],
  ["a read of a total the slot may not read is L004", (b) => b.sow("(pl, rng) => { pl.water = totals.grown; }"), ["L004"]],
  ["a bump in a pure slot is L004", (b) => b.rain("(t) => { totals.grown++; return 1; }"), ["L004"]],
  ["a write of a read-only member is L013", (b) => b.grow("(pl, dt) => { pl.age = 1; }"), ["L013"]],
  ["a write to part of a vector member is L013", (b) => b.grow("(pl, dt) => { pl.spot.x = 1; }"), ["L013"]],
  ["a total assigned is L017", (b) => b.grow("(pl, dt) => { totals.grown = 0; }"), ["L017"]],
  ["a total counted down is L017", (b) => b.grow("(pl, dt) => { totals.grown--; }"), ["L017"]],
  ["a bump used as a value is L017", (b) => b.grow("(pl, dt) => { pl.water = totals.grown++; }"), ["L017"]],
  ["a total read in a slot that may bump it is L017", (b) => b.grow("(pl, dt) => { if (totals.grown > 3) pl.water = 0; }"), ["L017"]],
  ["a verb in a helper is one L004, at the helper", (b) => b.fn("tall", "(pl) => { pl.wilt(); return pl.height > 2; }").grow("(pl, dt) => { if (tall(pl)) pl.water = 0; }"), ["L004@tall"]],
  ["a total read in a helper helpers.may does not list is one L004, at the helper", (b) => b.fn("tall", "(pl) => pl.height > totals.grown").grow("(pl, dt) => { if (tall(pl)) pl.water = 0; }"), ["L004@tall"]],
])) {
  test(why, () => {
    assert.deepEqual(lowered(build), codes);
  });
}

/** Lowers a garden Program; its error diagnostics as "code message | tip". @param {(b: any) => any} build @param {(d: Record<string, any>) => void} [edit] */
function errorTexts(build, edit = () => {}) {
  const def = gardenDef();
  edit(def);
  const gg = gardenGrammar(defineDialect(/** @type {any} */ (def)));
  const r = gg.lower(build(gg("beds").total("harvest").total("grown")).build());
  return r.diagnostics.filter((/** @type {any} */ d) => d.severity === "error").map((/** @type {any} */ d) => `${d.code} ${d.message} | ${d.tip}`);
}

test("a total read in a helper: the L004 tip says to read it in a slot that does not bump it, since the caller that bumps it may not", () => {
  const [l004] = errorTexts((b) => b.fn("tall", "(pl) => pl.height > totals.grown").grow("(pl, dt) => { if (tall(pl)) pl.water = 0; }"));
  assert.match(l004, /^L004 /);
  assert.doesNotMatch(l004, /read it in the lambda that calls the helper/);
  assert.match(l004, /Totals\.grown.*a slot that.*does not bump it/);
});

test("a read through a helper of a total the slot may bump is L017 naming the total and the helper, not the call", () => {
  const got = errorTexts((b) => b.fn("tall", "(pl) => pl.height > totals.grown").grow("(pl, dt) => { if (tall(pl)) pl.water = 0; }"), (d) => { d.helpers.may = ["read Plant", "read Totals"]; });
  assert.equal(got.length, 1, got.join("\n"));
  assert.match(got[0], /^L017 'Totals\.grown' is a total this grow may bump, so it may not read it through tall\./);
  assert.deepEqual(errorTexts((b) => b.grow("(pl, dt) => { if (totals.grown > 3) pl.water = 0; }")).map((t) => t.split(" is ")[0]), ["L017 'totals.grown'"], "read in the lambda itself: the total as written");
});

/** A bump in a Dialect whose numberType is f32: its error diagnostics as "code message | tip". @param {string} src @param {Record<string, "f32" | "f64">} [conversions] */
function f32Bump(src, conversions) {
  const d = defineDialect(/** @type {any} */ ({
    name: "dots", numberType: "f32", text: () => "", ...(conversions ? { conversions } : {}),
    spaces: { dot: { instance: "Dot" } },
    objects: { Dot: { label: "a dot", members: { x: { value: "f32", write: true } } }, Totals: { label: "totals", members: { n: { value: "f64", bump: true } } } },
    globals: { totals: "Totals" },
    targets: { js: { accepts: "*", compare: exact() } },
    slots: { step: { params: ["Dot"], returns: "void", space: "dot", may: ["write Dot", "bump Totals"] } },
  }));
  const gg = defineGrammar(d, { root: "w", constructs: { w: { opens: [name()], slots: { step: { kind: "decl", args: [lambda("step")], once: true } } } } });
  return gg.lower(gg("a").step(src).build()).diagnostics.filter((/** @type {any} */ x) => x.severity === "error").map((/** @type {any} */ x) => `${x.code} ${x.message} | ${x.tip}`);
}

test("in an f32 Dialect a total is still an f64: bumping it by an f32 is L003, and the tip writes the converted statement", () => {
  const [l003] = f32Bump("(p) => { totals.n += p.x * 2; }", { f64: "f64", f32: "f32" });
  assert.match(l003, /^L003 .*f32.*f64/);
  assert.match(l003, /totals\.n \+= f64\(p\.x \* 2\);/);
  const [none] = f32Bump("(p) => { totals.n += p.x; }");
  assert.match(none, /^L003 .*\| A total is an f64.*no conversion to f64.*conversions: \{ f64: "f64" \}/);
  for (const ok of ["(p) => { totals.n += f64(p.x); }", "(p) => { totals.n += 1; }", "(p) => { totals.n++; }"]) assert.deepEqual(f32Bump(ok, { f64: "f64" }), [], ok);
});

test("a Dialect that declares no effects: a member without write: true is read-only, and its slot may do nothing", () => {
  const d = defineDialect(/** @type {any} */ ({
    name: "plain", numberType: "f64", text: () => "",
    spaces: { s: { pure: true } }, objects: { O: { members: { v: "f64" } } },
    targets: { js: { accepts: "*", compare: exact() } },
    slots: { k: { params: ["O"], returns: "void", space: "s" } },
  }));
  const e = d.environment({});
  assert.deepEqual(e.objects.O.members.v, { kind: "value", t: "f64" });
  assert.deepEqual(e.slot({ id: "k", kind: "k", on: "p" }), { params: [{ obj: "O" }], returns: "void", space: "s", forbid: [], may: [] });
});
