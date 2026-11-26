// @ts-nocheck: the UI's lambdas are source text, never called.
// list(type) with no max is allowed in a Dialect's `state` only (leaf aNdksS, Ben's ruling 2026-11-25): elsewhere list() still
// needs a positive whole max. A UI lambda reads such a list's length and indexes it, never loops over it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defineDialect, defineGrammar, defineUI, run, exact, struct, list, opt, name, data, lambda, DefinitionError } from "../index.js";

const base = (extra = {}) => ({
  name: "open", numberType: "f64", conditions: "bool",
  spaces: { s: { pure: true } }, targets: { js: { accepts: "*", compare: exact() } },
  slots: { v: { params: [], returns: "f64", space: "s" } }, text: () => "", ...extra,
});
const codesOf = (def) => { try { defineDialect(def); return []; } catch (e) { assert.ok(e instanceof DefinitionError, String(e)); return e.diagnostics.map((d) => d.code); } };
const messagesOf = (def) => { try { defineDialect(def); return []; } catch (e) { return e.diagnostics.map((d) => d.message); } };

const dialect = defineDialect(base({
  state: { t: "f64", bodies: list(struct({ mass: "f64", name: "str" })), tags: list("str"), grid: list(list("f64", 3)), maybe: opt(list("f64")), xs: list("f64", 4), few: list(struct({ mass: "f64" }), 5), best: opt("f64"), bounds: struct({ w: "f64" }) },
}));
const grammar = defineGrammar(dialect, { root: "p", constructs: { p: { opens: [name()], slots: { v: { kind: "decl", args: [lambda("v")], once: true } } } } });
const program = () => { const { record, diagnostics } = run(() => grammar("o")); assert.deepEqual(diagnostics, []); return record; };
const tile = (...body) => defineUI(grammar, { tiles: { t: { title: "T", place: { splitBelow: "stage" }, body } } });
const uiCodes = (fn) => { try { tile({ kind: "stat", label: "x", value: fn }); return []; } catch (e) { assert.ok(e instanceof DefinitionError, String(e)); return e.diagnostics.map((d) => d.code); } };

test("a state list with no max is accepted and resolves to a list type with no max", () => {
  assert.deepEqual(dialect.stateType.struct.bodies.list.struct.mass, "f64");
  assert.equal("max" in dialect.stateType.struct.bodies && dialect.stateType.struct.bodies.max !== undefined, false);
  assert.equal(dialect.stateType.struct.tags.max, undefined);
  assert.equal(dialect.stateType.struct.grid.max, undefined);
  assert.equal(dialect.stateType.struct.grid.list.max, 3, "an inner list with a max keeps it");
  assert.equal(dialect.stateType.struct.maybe.opt.max, undefined);
});

test("checkState has no cap for a list with no max, and still checks every item", () => {
  const items = Array.from({ length: 5000 }, () => ({ mass: 1, name: "x" }));
  const v = { t: 0, bodies: items, tags: [], grid: [[1, 2, 3]], maybe: null, xs: [], few: [], bounds: { w: 1 } };
  assert.deepEqual(dialect.checkState(v), []);
  assert.equal(dialect.checkState({ ...v, grid: [[1, 2, 3, 4]] }).length, 1, "a list with a max still has its cap");
  assert.deepEqual(dialect.checkState({ ...v, bodies: [{ mass: "x", name: "y" }] }).map((m) => m.path), ["bodies[0].mass"]);
});

test("a state list still refuses a max that is not a positive whole number", () => {
  for (const max of [0, -1, 1.5, "9", NaN, null]) assert.deepEqual(codesOf(base({ state: { a: list("f64", max) } })), ["D023"], String(max));
});

test("list() with no max is refused outside state, with a tip saying where it is allowed", () => {
  const slotParam = base({ slots: { v: { params: [], returns: "f64", space: "s" }, w: { params: [list("f64")], returns: "f64", space: "s" } } });
  assert.deepEqual(codesOf(slotParam), ["D011"]);
  assert.match(messagesOf(slotParam)[0], /positive whole max/);
  assert.deepEqual(codesOf(base({ objects: { Box: { label: "a box", members: { xs: list("f64") } } } })), ["D011"]);
  assert.deepEqual(codesOf(base({ objects: { Box: { label: "a box", members: { xs: opt(list("f64")) } } } })), ["D011"]);
  assert.deepEqual(codesOf(base({ slots: { v: { params: [], returns: list(struct({ a: "f64" })), space: "s" } } })), ["D011"]);
  assert.deepEqual(codesOf(base({ slots: { v: { params: [], returns: list("f64", 5), space: "s" } } })), []);
});

test("a UI lambda reads a max-less list's length and rows; ui.lower lowers them", () => {
  assert.deepEqual(uiCodes((s) => s.bodies.length), []);
  assert.deepEqual(uiCodes((s) => s.bodies[0].mass), []);
  assert.deepEqual(uiCodes((s) => s.grid[0][1]), []);
  const ui = tile(
    { kind: "stat", label: "n", value: (s) => s.bodies.length, badIf: (s) => s.tags.length > 3 },
    { kind: "table", label: "B", rows: "bodies", columns: ["name", { label: "m", value: (row, s) => row.mass * s.bodies.length }] },
  );
  const r = ui.lower(program());
  assert.deepEqual(r.diagnostics.map((d) => [d.id, d.code, d.message]), []);
  assert.equal(Object.keys(r.kernels).length, 3);
});

test("an index into a max-less list lowers as the kit's index does: possibly empty, so L008 unguarded", () => {
  // Lowering narrows a possibly-empty value only through a local, so an index read with no local guard is L008 (3kCvsI keeps
  // this test as the unguarded half: the guarded const pattern is the next test).
  const r = tile({ kind: "stat", label: "m", value: (s) => s.bodies[0].mass }).lower(program());
  assert.deepEqual(r.diagnostics.map((d) => d.code), ["L008"]);
});

test("a const item guarded with != null lowers clean, for a list with a max and one without", () => {
  const lowers = (fn) => tile({ kind: "stat", label: "m", value: fn }).lower(program()).diagnostics.map((d) => d.code);
  assert.deepEqual(lowers((s) => { const b = s.bodies[0]; return b != null ? b.mass : 0; }), [], "no max");
  assert.deepEqual(lowers((s) => { const b = s.few[0]; return b != null ? b.mass : 0; }), [], "with a max");
  assert.deepEqual(lowers((s) => { const b = s.best; return b != null ? b : 0; }), [], "an optional");
  assert.deepEqual(lowers((s) => { const w = s.bounds; return w.w; }), []);
  assert.deepEqual(lowers((s) => { const b = s.bodies[0]; return b.mass; }), ["L008"], "unguarded stays L008");
  const loop = (s) => { let n = 0; for (let i = 0; i < s.xs.length; i++) n += s.xs[i]; return n; };
  assert.deepEqual(uiCodes(loop), [], "reviewer probe ui2 passes defineUI");
  assert.deepEqual(lowers(loop), ["L003"], "but kit/lower types s.xs[i] as possibly empty, so '+' refuses it: the kit's rule, not U007's");
  assert.deepEqual(lowers((s) => { let n = 0; for (let i = 0; i < s.xs.length; i++) { const x = s.xs[i]; n += x != null ? x : 0; } return n; }), [], "guarded through a const it lowers clean");
});

test("the open-list rule holds through a const", () => {
  assert.deepEqual(uiCodes((s) => { const xs = s.bodies; return xs.length; }), []);
  assert.deepEqual(uiCodes((s) => { const xs = s.bodies; return xs[0].mass; }), []);
  const refusedU = (fn) => { const c = uiCodes(fn); return c.length > 0 && c.every((x) => x === "U007"); };
  assert.ok(refusedU((s) => { const xs = s.bodies; let n = 0; for (let i = 0; i < xs.length; i++) n += 1; return n; }), "a loop bounded by xs.length");
  assert.ok(refusedU((s) => { const xs = s.bodies; let n = 0; for (const x of xs) n += 1; return n; }));
  assert.ok(refusedU((s) => { const xs = s.bodies; return Math.abs(xs); }), "used whole");
  assert.deepEqual(uiCodes((s) => { const g = s.grid[0]; return g.length; }), []);
  assert.deepEqual(uiCodes((s) => { const xs = s.bodies; return xs.filter((b) => b.mass > 0).length; }).length > 0, true);
});

test("a UI lambda never loops over a max-less list, uses it whole, or queries it", () => {
  const refused = (fn) => { const c = uiCodes(fn); return c.length > 0 && c.every((x) => x === "U007"); };
  assert.ok(refused((s) => { let n = 0; for (const b of s.bodies) n += 1; return n; }));
  assert.ok(refused((s) => { let n = 0; for (let i = 0; i < s.bodies.length; i++) n += 1; return n; }));
  assert.ok(refused((s) => { let n = 0; for (let i = 0; i < s.grid.length; i++) n += s.t; return n; }));
  assert.deepEqual(uiCodes((s) => s.tags), ["U007"], "whole");
  assert.ok(refused((s) => Math.abs(s.grid)), "whole, as an argument");
  assert.notDeepEqual(uiCodes((s) => s.bodies.filter((b) => b.mass > 0).length), []);
  assert.deepEqual(uiCodes((s) => s.grid[0].length), [], "an inner list has a max");
});

test("a counted loop to a list that has a max still passes", () => {
  const d = defineDialect(base({ state: { t: "f64", xs: list("f64", 4) } }));
  const g = defineGrammar(d, { root: "p", constructs: { p: { opens: [name()], slots: {} } } });
  defineUI(g, { tiles: { t: { title: "T", place: { splitBelow: "stage" }, body: [{ kind: "stat", label: "x", value: (s) => { let n = 0; for (let i = 0; i < s.xs.length; i++) n += 1; return n; } }] } } });
});
