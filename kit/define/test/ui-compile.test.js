// @ts-nocheck: the UI's lambdas are source text, lowered and emitted, never called, and name the Dialect's free names.
// The UI value's compile(record): every UI lambda lowered against one Program, emitted and instantiated as kit/run
// does a Program's Kernels, and evaluate(state, $) reading every tile and annotation from those Kernels (leaf dXp5WO:
// the page host used to call the author's functions). And the UI value's `control`, the run control its inputs are.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defineDialect, defineGrammar, defineUI, run, exact, enumOf, struct, list, name, data, lambda } from "../index.js";

const dialect = defineDialect(/** @type {any} */ ({
  name: "orbits", numberType: "f64",
  spaces: { s: { pure: true } },
  objects: {
    Params: { label: "the params ($)", members: {} },
    Pad: { label: "the pad", members: { up: "bool", fire: "bool" } },
    World: { label: "the world", members: { g: "f64" } },
    Math: { label: "Math", members: { max: { fn: { params: ["f64", "f64"], returns: "f64" } } } },
  },
  globals: { $: "Params", world: "World", Math: "Math" },
  targets: { js: { accepts: "*", compare: exact() } },
  slots: { v: { params: [], returns: "f64", space: "s" } },
  params: { object: "Params", name: "$" },
  environment(program) {
    const members = {};
    for (const n of Object.keys(program.params ?? {})) members[n] = "f64";
    return { objects: { Params: { members } } };
  },
  state: {
    t: "f64", alive: "bool", label: "str", mode: enumOf(["a", "b"]), bounds: struct({ width: "f64", height: "f64" }),
    bodies: list(struct({ name: "str", speed: "f64" }), 50),
  },
  text: (s) => String(s.t),
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

const STATE = Object.freeze({ t: 4, alive: true, label: "go", mode: "a", bounds: { width: 3, height: 2 }, bodies: [{ name: "x", speed: 8 }, { name: "y", speed: 2 }] });

test("compile(record) evaluates every component from the lowered Kernels, not the author's functions", () => {
  const twice = (s) => s.t * 2;
  // the lambda's text is what the kit lowers; a host that called the function would get t * 2
  twice.toString = () => "(s) => s.t * 3";
  const ui = tile({ kind: "stat", label: "n", value: twice });
  const c = ui.compile(program());
  assert.equal(c.ok, true);
  assert.deepEqual(c.diagnostics, []);
  assert.equal(c.evaluate(STATE, {}).tiles[0].body[0].value, 12);
});

test("evaluate gives each kind as data, in declaration order: values raw, a host formats them", () => {
  const ui = defineUI(orbits, {
    tiles: {
      live: { title: "Live", place: { splitRight: "stage" }, body: [
        { kind: "stat", label: "bodies", value: (s) => s.bodies.length, max: (s, $) => $.cap, unit: "n" },
        { kind: "check", label: "alive", expect: (s) => s.alive },
        { kind: "plot", label: "t", y: (s) => s.t / 8, window: 5 },
        { kind: "row", items: [{ kind: "text", value: (s) => s.label }, { kind: "stat", label: "w", value: "bounds.width" }] },
        { kind: "table", label: "Bodies", rows: "bodies", columns: ["name", { label: "rel", value: (row, s) => row.speed / Math.max(1, s.t) }], limit: 1 },
        { kind: "runs", label: "sweep", param: "cap", from: 0, to: 10, steps: 3, seconds: 1, y: (s, $) => s.t + $.cap },
      ] },
    },
  });
  const c = ui.compile(program("cap"));
  const { tiles } = c.evaluate(STATE, { cap: 2 });
  assert.deepEqual(tiles.map((t) => [t.id, t.title]), [["live", "Live"]]);
  assert.deepEqual(tiles[0].place, { splitRight: "stage" });
  const [stat, check, plot, row, table, runs] = tiles[0].body;
  assert.deepEqual(stat, { kind: "stat", label: "bodies", value: 2, unit: "n", max: 2, bad: true });
  assert.deepEqual(check, { kind: "check", label: "alive", ok: true });
  assert.deepEqual(plot, { kind: "plot", label: "t", window: 5, y: 0.5 });
  assert.deepEqual(row, { kind: "row", items: [{ kind: "text", value: "go" }, { kind: "stat", label: "w", value: 3, bad: false }] });
  assert.deepEqual(table, { kind: "table", label: "Bodies", columns: ["name", "rel"], rows: [["x", 2]] });
  assert.deepEqual(runs, { kind: "runs", label: "sweep", param: "cap", from: 0, to: 10, steps: 3, seconds: 1, y: "tiles.live.body[5].y" });
  assert.equal(c.value(runs.y, STATE, { cap: 7 }), 11, "a runs tile's y is read by its id");
});

test("a stat is bad at its max and past it, or while badIf holds, and not otherwise", () => {
  const ui = tile({ kind: "stat", label: "n", value: "t", max: (s, $) => $.cap }, { kind: "stat", label: "m", value: "t", badIf: (s) => !s.alive });
  const c = ui.compile(program("cap"));
  const bad = (/** @type {any} */ s, /** @type {number} */ cap) => c.evaluate(s, { cap }).tiles[0].body.map((x) => x.bad);
  assert.deepEqual(bad(STATE, 4), [true, false]);
  assert.deepEqual(bad(STATE, 9), [false, false]);
  assert.deepEqual(bad({ ...STATE, alive: false }, 9), [false, true]);
});

test("a lambda that did not lower is its component's error with the L code; the others still evaluate", () => {
  const ui = tile({ kind: "stat", label: "m", value: (s, $) => $.mass }, { kind: "check", label: "c", expect: (s) => s.alive });
  const c = ui.compile(program("rate"));
  assert.equal(c.ok, false);
  assert.deepEqual(c.diagnostics.map((d) => [d.id, d.code]), [["tiles.t.body[0].value", "L002"]]);
  const [m, check] = c.evaluate(STATE, { rate: 1 }).tiles[0].body;
  assert.equal(m.code, "L002");
  assert.match(m.error, /^L002 .*mass/);
  assert.equal(m.label, "m");
  assert.equal(check.ok, true);
  assert.throws(() => c.value("tiles.t.body[0].value", STATE, {}), /L002/);
});

test("a UI lambda never reads the host's global object: a Dialect global other than Math is an error value", () => {
  const ui = tile({ kind: "stat", label: "g", value: (s) => world.g * s.t });
  const c = ui.compile(program());
  assert.equal(c.ok, true, "lowering accepts a read of a Dialect global");
  globalThis.world = { g: 5 }; // a browser has globals by many names (status, screen, name)
  try {
    const [g] = c.evaluate(STATE, {}).tiles[0].body;
    assert.equal(g.error, "a UI lambda reads the global 'world', which has no value outside a step");
  } finally { delete globalThis.world; }
});

test("a UI lambda reading a free $ reads evaluate's $, never the host's (review H3)", () => {
  const ui = tile(
    { kind: "stat", label: "free", value: (s) => $.cap * s.t },
    { kind: "table", label: "rows", rows: "bodies", columns: [{ label: "c", value: (row) => row.speed + $.cap }] },
  );
  const c = ui.compile(program("cap"));
  assert.equal(c.ok, true);
  globalThis.$ = { cap: 999 }; // a page that loads jQuery has a global $
  try {
    const [stat, table] = c.evaluate(STATE, { cap: 2 }).tiles[0].body;
    assert.equal(stat.value, 8);
    assert.deepEqual(table.rows, [[10], [4]]);
    assert.equal(c.value("tiles.t.body[0].value", STATE, { cap: 3 }), 12);
    assert.equal(c.value("tiles.t.body[1].columns[0].value", { speed: 1 }, STATE, { cap: 3 }), 4);
  } finally { delete globalThis.$; }
});

test("annotations evaluate, and a param's takes '*''s fields under its own", () => {
  const ui = defineUI(orbits, {
    annotate: { params: { cap: { badge: (s, $) => ($.cap > 5 ? "big" : null), note: "the cap" }, "*": { tone: "dim", badge: "any" } }, traces: { t: { tone: (s) => (s.alive ? "good" : "bad") } } },
  });
  const c = ui.compile(program("cap", "rate"));
  assert.deepEqual(c.evaluate(STATE, { cap: 9, rate: 1 }).annotate, {
    params: { cap: { note: "the cap", badge: "big" }, "*": { tone: "dim", badge: "any" } },
    traces: { t: { tone: "good" } },
  });
  assert.deepEqual(c.annotation("params", "cap", STATE, { cap: 1, rate: 1 }), { tone: "dim", badge: null, note: "the cap" });
  assert.deepEqual(c.annotation("params", "rate", STATE, { cap: 1, rate: 1 }), { tone: "dim", badge: "any" });
  assert.deepEqual(c.annotation("traces", "t", { ...STATE, alive: false }, {}), { tone: "bad" });
  assert.deepEqual(c.annotation("traces", "nothing", STATE, {}), {});
});

/** The orbits Dialect and Grammar again, with the params read by the name `p` (review of d0b876c, finding 3). */
const pDialect = defineDialect(/** @type {any} */ ({ ...dialect.def, name: "porbits", globals: { p: "Params", world: "World", Math: "Math" }, params: { object: "Params", name: "p" } }));
const porbits = defineGrammar(pDialect, { root: "orbits", params: { slot: "param" }, constructs: orbits.grammar.constructs });

test("a UI lambda reads the params by the Dialect's params name, not always $ (review of d0b876c, finding 3)", () => {
  const { record } = run(() => porbits("o").param("cap", { value: 1, min: 0, max: 10 }));
  const ui = defineUI(porbits, { tiles: { t: { title: "T", place: { splitBelow: "stage" }, body: [
    { kind: "stat", label: "free", value: (s) => p.cap * s.t },
    { kind: "stat", label: "named", value: (s, q) => q.cap + s.t },
  ] } } });
  const c = ui.compile(record);
  assert.deepEqual(c.diagnostics, []);
  const [free, named] = c.evaluate(STATE, { cap: 2 }).tiles[0].body;
  assert.equal(free.value, 8, "a free p reads evaluate's params");
  assert.equal(named.value, 6, "a lambda's own second parameter still works");
  assert.equal(c.value("tiles.t.body[0].value", STATE, { cap: 3 }), 12);
});

test("value(id, ...args) refuses a call to a lambda without its whole convention, so the state is never bound as the params (finding 3)", () => {
  const ui = tile(
    { kind: "stat", label: "free", value: (s) => $.cap * s.t },
    { kind: "table", label: "rows", rows: "bodies", columns: [{ label: "c", value: (row, s, $) => row.speed + $.cap }] },
    { kind: "stat", label: "path", value: "bounds.width" },
  );
  const c = ui.compile(program("cap"));
  assert.throws(() => c.value("tiles.t.body[0].value", STATE), /value\(tiles\.t\.body\[0\]\.value\) takes \(state, \$\), 2 arguments, not 1/);
  assert.throws(() => c.value("tiles.t.body[1].columns[0].value", { speed: 1 }, STATE), /takes \(row, state, \$\), 3 arguments, not 2/);
  assert.throws(() => c.value("tiles.t.body[0].value", STATE, { cap: 3 }, {}), /not 3/);
  // what must still work: the whole convention, and a path or literal read from the first argument alone
  assert.equal(c.value("tiles.t.body[0].value", STATE, { cap: 3 }), 12);
  assert.equal(c.value("tiles.t.body[1].columns[0].value", { speed: 1 }, STATE, { cap: 3 }), 4);
  assert.equal(c.value("tiles.t.body[2].value", STATE), 3);
});
