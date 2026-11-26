// @ts-nocheck: the UI's lambdas are source text, never called, and name the Dialect's free names, which TypeScript cannot see.
// defineUI: the UI declaration checked against the Dialect's declared run's state; every U code is exercised here
// (leaf Spm6la; project/2026-11-25-defineui-build-plan.md). The trial checker's fixtures (scripts/ui-trial) cover the
// same checks through files and lines; these cover the library.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defineDialect, defineGrammar, defineUI, isUI, exact, vector, enumOf, opt, struct, list, name, DefinitionError, UI_CODES } from "../index.js";

const dialect = defineDialect(/** @type {any} */ ({
  name: "orbits", numberType: "f64",
  types: { vec2: vector(2, "f64", { aliases: { u: "x", v: "y" } }) },
  spaces: { s: { pure: true } },
  objects: {
    Pad: { label: "the pad", members: { left: "bool", right: "bool" } },
    Params: { label: "the params", members: { mass: "f64" } },
    Math: { label: "Math", members: { abs: { fn: { params: ["f64"], returns: "f64" } } }, rejected: { random: { message: "not reproducible", fix: "rng()" } } },
  },
  globals: { $: "Params", Math: "Math" },
  targets: { js: { accepts: "*", compare: exact() } },
  slots: { v: { params: [], returns: "f64", space: "s" } },
  params: { object: "Params", name: "$" },
  state: {
    t: "f64", alive: "bool", label: "str", mode: enumOf(["a", "b"]), center: "vec2", best: opt("f64"),
    bounds: struct({ width: "f64", height: "f64" }),
    bodies: list(struct({ name: "str", speed: "f64" }), 50),
    names: list("str", 10),
  },
  text: (/** @type {any} */ s) => String(s.t),
}));
const orbits = defineGrammar(dialect, { root: "p", constructs: { p: { opens: [name()], slots: {} } } });
const bare = defineDialect(/** @type {any} */ ({ name: "bare", numberType: "f64", spaces: { s: { pure: true } }, targets: { js: { accepts: "*", compare: exact() } }, slots: { v: { params: [], returns: "f64", space: "s" } }, text: () => "" }));
const bareGrammar = defineGrammar(bare, { root: "p", constructs: { p: { opens: [name()], slots: {} } } });

/** Every code any test below saw refused. @type {Set<string>} */
const seen = new Set();
/** @param {unknown} decl @param {import("../define.js").UIOptions} [options] @param {unknown} [builder] */
function refused(decl, options, builder = orbits) {
  try { defineUI(/** @type {any} */ (builder), /** @type {any} */ (decl), options); return []; } catch (e) {
    assert.ok(e instanceof DefinitionError, String(e));
    assert.ok(e.diagnostics.every((d) => d.tip.length > 0 && d.severity === "error"), "every diagnostic has a tip");
    for (const d of e.diagnostics) seen.add(d.code);
    return e.diagnostics;
  }
}
/** @param {unknown} decl @param {import("../define.js").UIOptions} [options] @param {unknown} [builder] */
const codes = (decl, options, builder = orbits) => refused(decl, options, builder).map((d) => d.code);
/** One tile with `body`, placed below the stage. @param {unknown[]} body */
const tile = (...body) => ({ tiles: { t: { title: "T", place: { splitBelow: "stage" }, body } } });
const stat = (/** @type {Record<string, unknown>} */ extra) => tile({ kind: "stat", label: "x", value: "t", ...extra });

test("every U code is documented in UI_CODES, U006 is retired, and each is exercised below", () => {
  assert.deepEqual(Object.keys(UI_CODES), ["U001", "U002", "U003", "U004", "U005", "U007", "U008", "U009", "U010", "U011", "U012", "U013"]);
});

test("a valid UI is frozen, remembers its package, and U-less", () => {
  const ui = defineUI(orbits, {
    stage: { element: "orbits-sky", module: "./orbits-sky.js", emits: ["select"] },
    inputs: { object: "Pad", buttons: { left: { role: "dpad.left" }, right: { role: "dpad.right", label: "Go" } } },
    tiles: {
      bodies: { title: "Bodies", place: { splitLeft: "stage", size: 0.25 }, body: [
        { kind: "stat", label: "n", value: (s) => s.bodies.length, max: "t", badIf: (s) => Math.abs(s.t) > 1 },
        { kind: "stat", label: "name", value: "label", max: (s, $) => $.mass },
        { kind: "table", label: "B", rows: "bodies", columns: ["name", { label: "km/s", value: (row, s, $) => row.speed / 1000 + s.bounds.width + $.mass }], limit: 20 },
        { kind: "table", label: "N", rows: "names", columns: [{ label: "n", value: (row) => row }] },
        { kind: "plot", label: "p", y: (s) => s.center.x + s.center.u + s.bodies.length, window: 10 },
        { kind: "check", label: "c", expect: (s) => s.mode === "a" && s.best !== null },
      ] },
      drift: { title: "D", place: { splitBelow: "bodies" }, body: [{ kind: "row", items: [{ kind: "text", value: "hello" }, { kind: "runs", label: "r", param: "mass", from: 0, to: 4, steps: 5, seconds: 2, y: "t" }] }] },
    },
    annotate: { traces: { t: { note: "seconds", tone: "warn" } }, params: { mass: { badge: (s, $) => ($.mass < 1 ? "light" : null) }, "*": { tone: "dim" } } },
  }, { moduleText: () => 'customElements.define("orbits-sky", class extends HTMLElement {});' });
  assert.ok(isUI(ui));
  assert.ok(Object.isFrozen(ui) && Object.isFrozen(ui.tiles) && Object.isFrozen(ui.tiles.bodies) && Object.isFrozen(/** @type {any} */ (ui.tiles.bodies).body));
  assert.equal(ui.package, "orbits");
  assert.equal(ui.builder, orbits);
  assert.ok(!isUI({}));
  // An empty UI is fine: everything is optional once the Dialect holds the state.
  assert.deepEqual(Object.keys(defineUI(orbits, {}).tiles), []);
});

test("U001: unknown key with a did-you-mean, a component's unknown key, a missing required key, a non-object", () => {
  const d = refused({ titles: {} });
  assert.deepEqual(d.map((x) => x.code), ["U001"]);
  assert.match(d[0].message, /Did you mean 'tiles'\?/);
  assert.deepEqual(d[0].path, ["titles"]);
  assert.deepEqual(codes(stat({ color: "red" })), ["U001"]);
  assert.deepEqual(codes({ tiles: { t: { place: { splitBelow: "stage" }, body: [{ kind: "text", value: "x" }] } } }), ["U001"]);
  assert.deepEqual(codes(5), ["U001"]);
  assert.deepEqual(codes(tile({ kind: "check", label: "x", expect: "alive", max: 3 })), ["U001"], "max is the stat's");
});

test("U001: a `state` key says the state is declared in defineDialect", () => {
  const [d, ...rest] = refused({ state: { t: "f64" } });
  assert.equal(rest.length, 0);
  assert.equal(d.code, "U001");
  assert.match(d.tip, /defineDialect/);
  assert.match(d.message, /state/);
});

test("U002, U003, U004, U011", () => {
  assert.match(refused(tile({ kind: "chek", label: "x", expect: "t" }))[0].message, /Did you mean 'check'\?/);
  assert.deepEqual(codes(tile({ kind: "chek" })), ["U002"]);
  const place = (/** @type {unknown} */ p) => ({ tiles: { t: { title: "T", place: p, body: [{ kind: "text", value: "x" }] } } });
  assert.deepEqual(codes(place({ splitBelow: "stag" })), ["U003"]);
  assert.match(refused(place({ splitBelow: "stag" }))[0].message, /Did you mean 'stage'\?/);
  assert.deepEqual(codes(place({ splitBelow: "orbits.stage" })), ["U003"], "a qualified id");
  assert.deepEqual(codes({ annotate: { ir: { t: { note: "x" } } } }), ["U003"]);
  assert.deepEqual(codes({ tiles: { a: { title: "A", place: { splitBelow: "b" }, body: [{ kind: "text", value: "x" }] }, b: { title: "B", place: { splitBelow: "a" }, body: [{ kind: "text", value: "x" }] } } }), ["U003"], "one cycle, one diagnostic");
  assert.deepEqual(codes(place({ splitBelow: "stage", splitLeft: "stage" })), ["U004"]);
  assert.deepEqual(codes(place({})), ["U004"]);
  assert.deepEqual(codes(place({ splitBelow: "stage", size: 1.5 })), ["U004"]);
  assert.deepEqual(codes(place({ tabWith: "stage", size: 0.5 })), ["U004"]);
  assert.deepEqual(codes(place({ below: "stage" })), ["U001"], "a misspelled direction is one U001");
  assert.deepEqual(codes({ tiles: { stage: { title: "T", place: { splitBelow: "text" }, body: [{ kind: "text", value: "x" }] } } }), ["U011"]);
  assert.deepEqual(codes({ tiles: { "not ok": { title: "T", place: { splitBelow: "text" }, body: [{ kind: "text", value: "x" }] } } }), ["U011"]);
});

test("U005: paths resolve against the Dialect's state: structs, vector components, never into a list", () => {
  assert.deepEqual(codes(stat({ value: "bounds.width" })), []);
  assert.deepEqual(codes(stat({ value: "center.x" })), []);
  assert.deepEqual(codes(stat({ value: "center.u" })), [], "a vector alias");
  assert.deepEqual(codes(stat({ value: "best" })), [], "an optional number is a number");
  assert.deepEqual(codes(stat({ value: "mode" })), [], "an enum is a string");
  const d = refused(stat({ value: "tt" }));
  assert.deepEqual(d.map((x) => x.code), ["U005"]);
  assert.match(d[0].message, /Did you mean 't'\?/);
  assert.deepEqual(codes(stat({ value: "bodies.speed" })), ["U005"], "a path stops at a list");
  assert.deepEqual(codes(stat({ value: "bounds" })), ["U005"], "an object is not a number");
  assert.deepEqual(codes(stat({ value: "t.x" })), ["U005"]);
  assert.deepEqual(codes(stat({ value: "label.length" })), ["U005"], "a path does not read a string's length");
  assert.deepEqual(codes(stat({ value: "constructor" })), ["U005"]);
  assert.deepEqual(codes(stat({ badIf: "t" })), ["U005"], "badIf takes a boolean");
  assert.deepEqual(codes(stat({ badIf: "alive" })), []);
  assert.deepEqual(codes(tile({ kind: "table", label: "x", rows: "t", columns: ["name"] })), ["U005"]);
  assert.deepEqual(codes(tile({ kind: "table", label: "x", rows: "bodies", columns: ["nme"] })), ["U005"]);
  assert.deepEqual(codes(tile({ kind: "table", label: "x", rows: "names", columns: ["name"] })), ["U005"], "a list of strings has no keys");
  assert.deepEqual(codes({ annotate: { traces: { bounds: { note: "x" } } } }), ["U005"]);
  assert.deepEqual(codes(stat({ max: "label" })), ["U005"], "max is a number");
});

test("U007: a lambda is checked against the Dialect's state and globals", () => {
  const ex = (/** @type {unknown} */ fn) => tile({ kind: "check", label: "x", expect: fn });
  assert.deepEqual(codes(ex((/** @type {any} */ s) => s.t > 0)), []);
  const typo = refused(ex((/** @type {any} */ s) => s.tt > 0));
  assert.deepEqual(typo.map((x) => x.code), ["U007"]);
  assert.match(typo[0].message, /Did you mean 't'\?/);
  assert.equal(typo[0].line, 1);
  assert.deepEqual(codes(ex((/** @type {any} */ s) => s.bodies.speed > 0)), ["U007"], "a list has length and items");
  assert.deepEqual(codes(ex((/** @type {any} */ s) => s.bodies[0].speed > 0 && s.bodies.length > 0 && s.center.y > 0)), []);
  assert.deepEqual(codes(ex((/** @type {any} */ s) => s.label.length > 0)), ["U007"], "a string has no length: lowering refuses it");
  assert.deepEqual(codes(ex((/** @type {any} */ s) => s.center[1] > 0)), ["U007"], "a vector is read by component name");
  assert.deepEqual(codes(ex((/** @type {any} */ s) => s.center.z > 0)), ["U007"], "a vec2 has no z");
  assert.deepEqual(codes(ex((/** @type {any} */ s) => s.t.length > 0)), ["U007"], "only a string has length");
  assert.deepEqual(codes(ex((/** @type {any} */ s) => s === 0)), ["U007"], "the state is not used whole");
  assert.deepEqual(codes(ex((/** @type {any} */ s) => s.constructor === 0)), ["U007"]);
  assert.deepEqual(codes(ex((/** @type {any} */ s) => { s.t = 0; return true; })), ["U007"], "assigns the state");
  assert.deepEqual(codes(ex((/** @type {any} */ s) => { let n = 1; n += 2; return n > s.t; })), [], "a let local is assignable");
  assert.deepEqual(codes(ex((/** @type {any} */ s) => { let n = 1; n += s.t; return n > 0; })), [], "and set from a scalar of the state (3kCvsI)");
  assert.deepEqual(codes(ex((/** @type {any} */ s) => { let b = s.bounds; return b.width > 0; })), ["U007"], "but a let does not hold a struct of the state");
  assert.deepEqual(codes(ex((/** @type {any} */ s) => s.t > LIMIT)), ["U007"], "a free name the Dialect does not give");
  assert.deepEqual(codes(ex((/** @type {any} */ s, /** @type {any} */ $, /** @type {any} */ x) => s.t > x)), ["U007"], "too many parameters");
  assert.deepEqual(codes(ex(function (/** @type {any} */ s) { return s.t > 0; })), ["U007"], "outside the subset");
  assert.deepEqual(codes(ex((/** @type {any} */ s) => Math.abs(s.t) > 0)), []);
  const rnd = refused(ex((/** @type {any} */ s) => Math.random() > s.t));
  assert.deepEqual(rnd.map((x) => x.code), ["U007"]);
  assert.match(rnd[0].message, /not reproducible/);
  assert.deepEqual(codes(ex((/** @type {any} */ s, /** @type {any} */ $) => $.anything > s.t)), [], "params are per Program");
  // A table column's row is one item of the list.
  const col = (/** @type {unknown} */ fn) => tile({ kind: "table", label: "x", rows: "bodies", columns: [{ label: "c", value: fn }] });
  assert.deepEqual(codes(col((/** @type {any} */ row) => row.speed)), []);
  assert.deepEqual(codes(col((/** @type {any} */ row) => row.spd)), ["U007"]);
  assert.deepEqual(codes(col((/** @type {any} */ row) => row / 2)), ["U007"], "an object row is not used whole");
  assert.deepEqual(codes(tile({ kind: "text", value: (/** @type {any} */ s) => s.nope })), ["U007"]);
  assert.deepEqual(codes({ annotate: { params: { mass: { badge: (/** @type {any} */ s) => s.nope } } } }), ["U007"]);
});

test("U008: a custom element's tag, module and definition; the module checks need moduleText", () => {
  const stage = (/** @type {Record<string, unknown>} */ o) => ({ stage: { element: "orbits-sky", module: "./orbits-sky.js", ...o } });
  const text = (/** @type {string} */ t) => ({ moduleText: () => t });
  const defines = 'customElements.define("orbits-sky", class extends HTMLElement {});';
  assert.deepEqual(codes(stage({}), text(defines)), []);
  assert.deepEqual(codes(stage({ element: "pt-sky" }), text(defines)), ["U008"], "no package prefix");
  assert.deepEqual(codes(stage({ element: "orbits-Sky" }), text(defines)), ["U008"]);
  assert.deepEqual(codes({ stage: { element: "orbits-sky" } }, text(defines)), ["U008"], "no module");
  assert.deepEqual(codes(stage({ module: "https://cdn.example/x.js" }), text(defines)), ["U008"], "not a package file");
  assert.deepEqual(codes(stage({ module: "../x.js" }), text(defines)), ["U008"]);
  assert.deepEqual(codes(stage({}), text("export const x = 1;")), ["U008"], "does not define the tag");
  assert.deepEqual(codes(stage({}), text('// customElements.define("orbits-sky", X)')), ["U008"], "not in a comment");
  assert.deepEqual(codes(stage({}), { moduleText: () => null }), ["U008"], "not a readable file");
  assert.deepEqual(codes(stage({})), [], "without moduleText the file checks are skipped");
  assert.deepEqual(codes(stage({ element: "pt-sky" })), ["U008"], "but the tag is still checked");
  assert.deepEqual(codes({ stage: { module: "./x.js" } }), ["U001", "U008"], "a module alone: the element is missing, and the module has none");
  const twice = tile({ kind: "stat", label: "a", value: "t", element: "orbits-s", module: "./s.js" }, { kind: "stat", label: "b", value: "t", element: "orbits-s", module: "./s.js" });
  assert.deepEqual(codes(twice, { moduleText: () => 'customElements.define("orbits-s", class extends HTMLElement {});' }), ["U008"], "one tag used twice");
});

test("U009: an event the contract does not have, and emits without an element", () => {
  const stage = (/** @type {unknown} */ emits) => ({ stage: { element: "orbits-sky", module: "./orbits-sky.js", emits } });
  assert.match(refused(stage(["pick", "click"]))[0].message, /click/);
  assert.deepEqual(codes(stage(["pick", "click"])), ["U009"]);
  assert.deepEqual(codes(stage(["pick", "select", "param"])), []);
  assert.deepEqual(codes(stat({ emits: ["pick"] })), ["U009"]);
});

test("U010: inputs against the Dialect's object", () => {
  const inputs = (/** @type {Record<string, unknown>} */ o) => ({ inputs: { object: "Pad", buttons: { left: {}, right: {} }, ...o } });
  assert.deepEqual(codes(inputs({})), []);
  assert.match(refused(inputs({ object: "Pads" }))[0].message, /Did you mean 'Pad'\?/);
  assert.deepEqual(codes(inputs({ buttons: { left: {} } })), ["U010"], "buttons are the members exactly");
  assert.deepEqual(codes(inputs({ buttons: { left: {}, right: {}, up: {} } })), ["U010"]);
  assert.deepEqual(codes(inputs({ buttons: { left: { role: "dpad.lft" }, right: {} } })), ["U010"]);
  assert.deepEqual(codes(inputs({ buttons: { left: { role: "a" }, right: { role: "a" } } })), ["U010"], "a role once");
  assert.match(refused(inputs({ buttons: {} })).map((d) => d.message).join(" "), /no buttons/);
  assert.deepEqual(codes(inputs({ object: "Params", buttons: { mass: {} } })), ["U010"], "members that are not bool");
});

test("U012: values of the wrong form", () => {
  const runs = (/** @type {Record<string, unknown>} */ o) => tile({ kind: "runs", label: "r", param: "mass", from: 0, to: 4, steps: 5, seconds: 2, y: "t", ...o });
  assert.deepEqual(codes(runs({})), []);
  assert.deepEqual(codes(runs({ steps: 1 })), ["U012"]);
  assert.deepEqual(codes(runs({ steps: 2.5 })), ["U012"]);
  assert.deepEqual(codes(runs({ seconds: 0 })), ["U012"]);
  assert.deepEqual(codes(runs({ seconds: 3601 })), ["U012"]);
  assert.deepEqual(codes(runs({ from: 4, to: 0 })), ["U012"]);
  assert.deepEqual(codes(tile({ kind: "plot", label: "p", y: "t", window: 0 })), ["U012"]);
  assert.deepEqual(codes(tile({ kind: "stat", label: 3, value: "t" })), ["U012"]);
  assert.deepEqual(codes(tile({ kind: "table", label: "x", rows: "bodies", columns: [3] })), ["U012"]);
  assert.deepEqual(codes(tile({ kind: "table", label: "x", rows: "bodies", columns: ["name"], limit: 1001 })), ["U012"]);
  assert.deepEqual(codes({ tiles: { t: { title: "T", place: { splitBelow: "stage" }, body: [] } } }), ["U012"], "an empty body");
  assert.deepEqual(codes(tile({ kind: "row", items: [] })), ["U012"]);
  assert.deepEqual(codes(stat({ value: 7 })), ["U012"], "a value is a path or a lambda");
  assert.deepEqual(codes({ annotate: { params: { mass: { tone: "loud" } } } }), ["U012"]);
});

test("U013: not a Grammar builder, or a Dialect that declares no state", () => {
  assert.deepEqual(codes({}, undefined, {}), ["U013"]);
  assert.deepEqual(codes({}, undefined, () => 1), ["U013"]);
  assert.deepEqual(codes({}, undefined, null), ["U013"]);
  assert.deepEqual(codes({}, undefined, Object.assign(() => 1, { grammar: {}, dialect: {} })), ["U013"], "a look-alike");
  const noState = refused({}, undefined, bareGrammar);
  assert.deepEqual(noState.map((d) => d.code), ["U013"]);
  assert.match(noState[0].message, /declares no state/);
  assert.match(noState[0].tip, /state:/);
  assert.deepEqual(refused({ tiles: { t: { title: "T", place: { splitBelow: "stage" }, body: [{ kind: "stat", label: "x", value: "t" }] } } }, undefined, bareGrammar).map((d) => d.code), ["U013"], "no state: nothing to resolve a path against, so no U005 too");
});

test("every problem is collected in one DefinitionError, with its path", () => {
  const e = (() => { try { defineUI(orbits, /** @type {any} */ ({ nope: 1, tiles: { t: { title: 3, place: { splitBelow: "stag" }, body: [{ kind: "stat", label: "x", value: "tt" }] } } })); } catch (x) { return /** @type {DefinitionError} */ (x); } })();
  assert.ok(e instanceof DefinitionError);
  assert.deepEqual(e.diagnostics.map((d) => [d.code, d.path.join(".")]).sort(), [["U001", "nope"], ["U003", "tiles.t.place.splitBelow"], ["U005", "tiles.t.body.0.value"], ["U012", "tiles.t.title"]]);
  assert.match(e.message, /defineUI refused/);
});

test("every UI code was refused by a test above, and U006 is retired", () => {
  for (const c of Object.keys(UI_CODES)) assert.ok(seen.has(c), `no test triggers ${c}`);
  assert.ok(!("U006" in UI_CODES) && !seen.has("U006"));
});
