// @ts-nocheck: the UI's lambdas are source text, never called, and name the Dialect's free names, which TypeScript cannot see.
// The UI value's lower(record): every UI lambda lowered through kit/lower against one Program, in an implied pure
// space, with `s` the Dialect's state Type, `$` what environment(program) gives the params, a column's `row` the item
// Type of its table's list, and each key's result Type (leaf mkPzcU; project/2026-11-25-defineui-build-plan.md).
// The particles and maze packages' passing fixtures (scripts/ui-trial/fixtures/valid) are lowered as they are.
import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { defineDialect, defineGrammar, defineUI, run, exact, scalar, vector, enumOf, struct, list, name, data, lambda } from "../index.js";

const KIT_DEFINE = new URL("../index.js", import.meta.url).href;
const ROOT = new URL("../../../", import.meta.url);
const FIXTURES = new URL("scripts/ui-trial/fixtures/valid/", ROOT).href;
/** The fixtures import their package's grammar as a sibling: point each at its package. */
const GRAMMARS = {
  "./particles.grammar.js": new URL("scripts/particles/reference/particles.grammar.js", ROOT).href,
  "./maze.grammar.js": new URL("scripts/ui-trial/packages/maze/maze.grammar.js", ROOT).href,
};
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "kit/define") return { url: KIT_DEFINE, format: "module", shortCircuit: true };
    if (context.parentURL?.startsWith(FIXTURES) && Object.hasOwn(GRAMMARS, specifier)) return { url: GRAMMARS[specifier], format: "module", shortCircuit: true };
    return next(specifier, context);
  },
});

const dialect = defineDialect(/** @type {any} */ ({
  name: "orbits", numberType: "f64", conditions: "bool",
  types: { vec2: vector(2, "f64"), meters: scalar("f64") },
  spaces: { s: { pure: true } },
  objects: {
    Params: { label: "the params ($)", members: {} },
    Rng: { label: "the random stream (rng)", call: { params: [], returns: "f64" }, effects: ["rng"] },
    Math: { label: "Math", members: { max: { fn: { params: ["f64", "f64"], returns: "f64" } } } },
  },
  globals: { $: "Params", rng: "Rng", Math: "Math" },
  targets: { js: { accepts: "*", compare: exact() } },
  slots: { v: { params: [], returns: "f64", space: "s" } },
  params: { object: "Params", name: "$" },
  environment(program) {
    const members = {};
    for (const n of Object.keys(program.params ?? {})) members[n] = "f64";
    return { objects: { Params: { members } } };
  },
  state: {
    t: "f64", alive: "bool", label: "str", mode: enumOf(["a", "b"]), center: "vec2", reach: "meters", bounds: struct({ width: "f64", height: "f64" }),
    bodies: list(struct({ name: "str", speed: "f64" }), 50),
    names: list("str", 10),
  },
  text: (/** @type {any} */ s) => String(s.t),
}));
const orbits = defineGrammar(dialect, {
  root: "orbits",
  params: { slot: "param" },
  constructs: {
    orbits: {
      opens: [name()],
      slots: {
        param: { kind: "decl", args: [name("param"), data({ value: "number", min: "number", max: "number" })], as: "params" },
        v: { kind: "decl", args: [lambda("v")], once: true },
      },
    },
  },
});

/** A Program's record, declaring the params named. @param {string[]} params */
function program(...params) {
  const { record, diagnostics } = run(() => {
    let p = orbits("o");
    for (const n of params) p = p.param(n, { value: 1, min: 0, max: 10 });
    return p;
  });
  assert.deepEqual(diagnostics, []);
  return record;
}
/** One tile `t` with `body`. @param {unknown[]} body */
const tile = (...body) => defineUI(orbits, { tiles: { t: { title: "T", place: { splitBelow: "stage" }, body } } });
/** The diagnostics, as [id, code] pairs. @param {{ diagnostics: any[] }} r */
const at = (r) => r.diagnostics.map((d) => [d.id, d.code]);

test("a UI value has lower(record), which lowers every UI lambda against that Program", () => {
  const ui = defineUI(orbits, {
    tiles: {
      live: { title: "Live", place: { splitRight: "stage" }, body: [
        { kind: "stat", label: "bodies", value: (s) => s.bodies.length, max: (s, $) => $.cap, badIf: (s) => s.bodies.length > 40 },
        { kind: "check", label: "alive", expect: (s) => s.alive },
        { kind: "plot", label: "t", y: (s) => s.t * 2, window: 5 },
        { kind: "row", items: [{ kind: "text", value: (s) => s.label }] },
        { kind: "table", label: "Bodies", rows: "bodies", columns: ["name", { label: "rel", value: (row, s) => row.speed / Math.max(1, s.t) }] },
        { kind: "table", label: "Names", rows: "names", columns: [{ label: "n", value: (row) => row }] },
      ] },
    },
    annotate: { params: { cap: { badge: (s, $) => ($.cap > 5 ? "big" : null), tone: (s) => (s.alive ? null : "bad") } } },
  });
  assert.equal(typeof ui.lower, "function");
  const r = ui.lower(program("cap"));
  assert.deepEqual(r.diagnostics, []);
  assert.deepEqual(Object.keys(r.kernels).sort(), [
    "annotate.params.cap.badge", "annotate.params.cap.tone",
    "tiles.live.body[0].badIf", "tiles.live.body[0].max", "tiles.live.body[0].value",
    "tiles.live.body[1].expect", "tiles.live.body[2].y", "tiles.live.body[3].items[0].value",
    "tiles.live.body[4].columns[1].value", "tiles.live.body[5].columns[0].value",
  ]);
  for (const k of Object.values(r.kernels)) assert.ok(k && typeof k === "object", "every lambda has a Kernel");
  const badIf = r.lambdas.find((l) => l.id === "tiles.live.body[0].badIf");
  assert.deepEqual([badIf.tile, badIf.key, badIf.path], ["live", "badIf", ["tiles", "live", "body", 0, "badIf"]]);
  const badge = r.lambdas.find((l) => l.id === "annotate.params.cap.badge");
  assert.deepEqual([badge.tile, badge.key], [null, "badge"]);
});

test("a badIf or expect that is not a bool is an L code tied to its tile and key", () => {
  const ui = tile({ kind: "stat", label: "t", value: "t", badIf: (s) => s.t }, { kind: "check", label: "c", expect: (s) => s.label });
  const r = ui.lower(program());
  assert.deepEqual(at(r), [["tiles.t.body[0].badIf", "L003"], ["tiles.t.body[1].expect", "L003"]]);
  const d = r.diagnostics[0];
  assert.deepEqual([d.tile, d.key, d.path], ["t", "badIf", ["tiles", "t", "body", 0, "badIf"]]);
  assert.equal(r.kernels["tiles.t.body[0].badIf"], undefined, "a lambda that does not lower has no Kernel");
});

test("a $ param the Program does not declare is an L code; one it declares lowers", () => {
  const ui = tile({ kind: "stat", label: "m", value: (s, $) => $.mass });
  assert.deepEqual(at(ui.lower(program("rate"))), [["tiles.t.body[0].value", "L002"]]);
  assert.match(ui.lower(program("rate")).diagnostics[0].message, /mass/);
  assert.deepEqual(at(ui.lower(program("mass"))), []);
});

test("a bad row read is an L code tied to its column", () => {
  const ui = tile({ kind: "table", label: "B", rows: "bodies", columns: ["name", { label: "x", value: (row, s) => row.name * s.t }] });
  const r = ui.lower(program());
  assert.deepEqual(at(r), [["tiles.t.body[0].columns[1].value", "L003"]]);
  assert.deepEqual([r.diagnostics[0].tile, r.diagnostics[0].key], ["t", "value"]);
});

test("value, max, y and runs' y take a number, a nominal scalar included; a stat's value also a string", () => {
  const good = tile(
    { kind: "stat", label: "a", value: (s) => s.label, max: (s) => s.reach },
    { kind: "stat", label: "b", value: (s) => s.mode },
    { kind: "stat", label: "c", value: (s) => s.reach },
    { kind: "plot", label: "d", y: (s) => s.reach, window: 1 },
    { kind: "runs", label: "e", param: "rate", from: 0, to: 1, steps: 2, seconds: 1, y: (s, $) => $.rate },
  );
  assert.deepEqual(at(good.lower(program("rate"))), []);
  const bad = tile(
    { kind: "stat", label: "a", value: (s) => s.alive, max: (s) => s.label },
    { kind: "plot", label: "d", y: (s) => s.label, window: 1 },
    { kind: "runs", label: "e", param: "rate", from: 0, to: 1, steps: 2, seconds: 1, y: (s) => s.center },
    { kind: "table", label: "B", rows: "bodies", columns: [{ label: "x", value: (row) => row.speed > 1 }] },
  );
  assert.deepEqual(at(bad.lower(program("rate"))), [
    ["tiles.t.body[0].value", "L003"], ["tiles.t.body[0].max", "L003"], ["tiles.t.body[1].y", "L003"],
    ["tiles.t.body[2].y", "L003"], ["tiles.t.body[3].columns[0].value", "L003"],
  ]);
});

test("badge gives a string or null, tone one of the tones or null, a text's value a string", () => {
  const ok = defineUI(orbits, {
    tiles: { t: { title: "T", place: { splitBelow: "stage" }, body: [{ kind: "text", value: (s) => s.mode }] } },
    annotate: { params: { "*": { badge: (s) => s.label, tone: (s) => (s.t > 1 ? "warn" : "good") } }, traces: { t: { tone: (s) => null } } },
  });
  assert.deepEqual(at(ok.lower(program())), []);
  const bad = defineUI(orbits, {
    tiles: { t: { title: "T", place: { splitBelow: "stage" }, body: [{ kind: "text", value: (s) => s.t }] } },
    annotate: { params: { "*": { badge: (s) => s.t, tone: (s) => "loud" } } },
  });
  const r = bad.lower(program());
  assert.deepEqual(at(r), [["tiles.t.body[0].value", "L003"], ["annotate.params[\"*\"].badge", "L003"], ["annotate.params[\"*\"].tone", "L003"]]);
  assert.deepEqual([r.diagnostics[1].tile, r.diagnostics[1].key], [null, "badge"]);
});

test("a list in the state has a length though the Dialect declares no list members, and loops over it lower", () => {
  const ui = tile({ kind: "stat", label: "sum", value: (s) => {
    let n = 0;
    for (const b of s.bodies) n += b.speed;
    for (let i = 0; i < s.names.length; i++) n += 1;
    return n;
  } });
  assert.deepEqual(at(ui.lower(program())), []);
});

test("for a Dialect that declares no params, $ is an object with no members", () => {
  const plain = defineDialect(/** @type {any} */ ({
    name: "plain", numberType: "f64", conditions: "bool", spaces: { s: { pure: true } },
    targets: { js: { accepts: "*", compare: exact() } }, slots: { v: { params: [], returns: "f64", space: "s" } },
    state: { t: "f64" }, text: () => "",
  }));
  const g = defineGrammar(plain, { root: "p", constructs: { p: { opens: [name()], slots: {} } } });
  const ui = defineUI(g, { tiles: { t: { title: "T", place: { splitBelow: "stage" }, body: [
    { kind: "stat", label: "t", value: (s) => s.t }, { kind: "stat", label: "m", value: (s, $) => $.mass },
  ] } } });
  const { record } = run(() => g("x"));
  assert.deepEqual(at(ui.lower(record)), [["tiles.t.body[1].value", "L002"]]);
});

test("a bad state read through a local, a ternary or a pattern, which defineUI lets through (kQu7xe), is an L code", () => {
  const ui = defineUI(orbits, { tiles: {
    t: { title: "T", place: { splitBelow: "stage" }, body: [
      { kind: "check", label: "a", expect: (s) => { const b = s.bounds; return b.bogus > 0; } },
      { kind: "check", label: "b", expect: (s) => (s.t > 0 ? s.bounds : s.bounds).bogus > 0 },
      { kind: "check", label: "c", expect: (s) => { const { bogus } = s.bounds; return bogus > 0; } },
    ] },
  } });
  const r = ui.lower(program());
  assert.deepEqual(at(r), [["tiles.t.body[0].expect", "L002"], ["tiles.t.body[1].expect", "L002"], ["tiles.t.body[2].expect", "L002"]]);
});

test("UI lambdas run in an implied pure space: an effect is L004", () => {
  const ui = tile({ kind: "stat", label: "r", value: (s) => rng() });
  assert.deepEqual(at(ui.lower(program())), [["tiles.t.body[0].value", "L004"]]);
});

test("the particles fixture lowers clean against a particles Program", async () => {
  const { particlesUI } = await import(new URL("particles.ui.js", FIXTURES).href);
  const { particles } = await import(GRAMMARS["./particles.grammar.js"]);
  const { record, diagnostics } = run(($) => particles("f")
    .param("rate", { value: 60, min: 0, max: 400 })
    .bounds({ width: 400, height: 300 })
    .maxParticles(500)
    .emitter("jet", { x: 200, y: 290, maxRate: 400 })
    .rate((t, live) => $.rate)
    .spawn((p, rng) => { p.life = 1 + rng(); }));
  assert.deepEqual(diagnostics, []);
  const r = particlesUI.lower(record);
  assert.deepEqual(r.diagnostics, []);
  assert.deepEqual(Object.keys(r.kernels).sort(), [
    "annotate.params.rate.badge",
    "tiles.health.body[0].items[0].badIf", "tiles.health.body[0].items[0].value",
    "tiles.health.body[1].expect", "tiles.health.body[2].columns[2].value", "tiles.health.body[3].y",
    "tiles.sweep.body[1].y",
  ]);
});

test("the maze fixture lowers clean against the maze example Program", async () => {
  const { mazeUI } = await import(new URL("maze.ui.js", FIXTURES).href);
  const example = (await import(new URL("scripts/ui-trial/packages/maze/examples/01.js", ROOT).href)).default;
  const { record, diagnostics } = run(example);
  assert.deepEqual(diagnostics, []);
  const r = mazeUI.lower(record);
  assert.deepEqual(r.diagnostics, []);
  assert.deepEqual(Object.keys(r.kernels).sort(), ["tiles.score.body[1].badIf", "tiles.score.body[2].expect"]);
});
