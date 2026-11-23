// One test per lowering diagnostic: its code, where it points, and its fix line.
import { test } from "node:test";
import assert from "node:assert/strict";
import { lower, codes } from "./fixture.js";
import { LOWER_CODES } from "../index.js";

/**
 * Lowers `src` and returns the single diagnostic with `code`.
 * @param {string} code
 * @param {Parameters<typeof lower>} args
 */
function only(code, ...args) {
  const r = lower(...args);
  assert.equal(r.kernel, null, "a lambda with an error yields no kernel");
  const ds = r.diagnostics.filter((d) => d.code === code);
  assert.equal(ds.length, 1, `expected one ${code}, got ${codes(r).join(", ")}`);
  const d = ds[0];
  const src = args[0];
  assert.equal(d.severity, "error");
  assert.ok(d.range[0] >= 0 && d.range[1] <= src.length && d.range[0] < d.range[1]);
  assert.ok(d.tip.length > 0 && !d.tip.includes("\n"), "a one-line fix");
  return { d, text: src.slice(d.range[0], d.range[1]) };
}

test("every lowering code has a test below", () => {
  assert.deepEqual(Object.keys(LOWER_CODES), ["L001", "L002", "L003", "L004", "L005", "L006", "L007", "L008", "L009", "L010", "L011", "L012", "L013", "L014", "L015"]);
});

test("L001: a free identifier the dialect does not declare", () => {
  const { d, text } = only("L001", "(self) => { if (self.up) placeFood(self); }");
  assert.equal(text, "placeFood");
  assert.match(d.message, /placeFood/);
  assert.match(d.tip, /top-level/);
  assert.equal(d.loc.start.line, 1);
});

test("L002: an unknown member, with a suggestion", () => {
  const { d, text } = only("L002", "(self) => { self.tll = 3; }");
  assert.equal(text, "tll");
  assert.match(d.tip, /Did you mean 'ttl'\?/);
});

test("L003: a type mismatch", () => {
  const { d } = only("L003", "(self) => { self.up = \"yes\"; }");
  assert.match(d.message, /str/);
  assert.match(d.tip, /bool/);
  const r = only("L003", "(self) => (self.up ? \"upp\" : null)", "draw");
  assert.equal(r.text, "\"upp\"");
  assert.match(r.d.tip, /up, peek/);
});

test("L004: an effect the slot forbids", () => {
  const { d, text } = only("L004", "(self) => { self.up = false; return \"up\"; }", "draw");
  assert.equal(text, "self.up = false");
  assert.match(d.tip, /render/);
});

test("L005: a callback passed to something that is not a declared query", () => {
  const { d } = only("L005", "(w) => { w.rng.pick((m) => m.up); }", "timer", "World");
  assert.match(d.tip, /filter, find, some, every, reduce/);
});

test("L006: a query callback with an effect", () => {
  const { d, text } = only("L006", "(w) => { w.board.filter((m) => w.rand(2) === 0); }", "timer", "World");
  assert.equal(text, "w.rand(2)");
  assert.match(d.tip, /pure/);
});

test("L007: a loop whose bound is not a constant, a param or a declared size", () => {
  const { d } = only("L007", "(self) => { for (let i = 0; i < self.ttl; i++) self.rise++; }");
  assert.match(d.tip, /param/);
  only("L007", "(w) => { for (let i = 0; i < 4; i++) { i = 0; } }", "timer", "World");
  assert.deepEqual(codes(lower("(w) => { for (let i = 0; i < 4; i++) w.sfx(\"pop\"); }", "timer", "World")), []);
  const start = only("L007", "(w) => { for (let i = w.next * 1e16; i < 4; i++) w.sfx(\"pop\"); }", "timer", "World");
  assert.equal(start.text, "w.next * 1e16");
  assert.match(start.d.tip, /starting from an integer or a param/);
});

test("L006 also covers a callback assigning the enclosing lambda's local", () => {
  const { d, text } = only("L006", "(w) => { let n = 0; w.board.filter((m) => (n = n + 1) > 2); }", "timer", "World");
  assert.equal(text, "n");
  assert.match(d.tip, /pure/);
});

test("L008: a possibly-empty reference used without a check", () => {
  const { d, text } = only("L008", "(w) => { const m = w.rng.pick(w.board); m.up = true; }", "timer", "World");
  assert.equal(text, "m");
  assert.match(d.tip, /if \(!m\) return;/);
});

test("L009: a dynamic property name", () => {
  const { d } = only("L009", "(self) => { const k = \"up\"; self[k] = false; }");
  assert.match(d.tip, /self\.name/);
});

test("L010: more parameters than the slot passes", () => {
  const { d, text } = only("L010", "(self, w, extra) => { self.up = false; }");
  assert.equal(text, "extra");
  assert.match(d.tip, /\(self, w\)/);
});

test("L011: a name argument that must be a literal, or names nothing declared", () => {
  const a = only("L011", "(w) => { const n = \"spawn\"; return w.param(n); }", "every", "World");
  assert.match(a.d.tip, /literal/);
  const b = only("L011", "(w) => w.param(\"spwan\")", "every", "World");
  assert.match(b.d.tip, /Did you mean 'spawn'\?/);
});

test("L012: a subset construct lowering does not handle yet", () => {
  const { d } = only("L012", "(w) => { for (const m of w.board) m.up = false; }", "timer", "World");
  assert.match(d.message, /for…of/);
  const index = only("L012", "(w) => { w.board[0].up = false; }", "timer", "World");
  assert.equal(index.text, "w.board[0]");
  assert.match(index.d.tip, /find|at\(i\)/);
});

test("L012 on a declaration still declares its names, so their uses add no L001", () => {
  assert.deepEqual(codes(lower("(w) => { const { x, y } = w.input.axis(); w.next = x + y; }", "timer", "World")), ["L012"]);
  assert.deepEqual(codes(lower("(w) => { let d; w.next = d; }", "timer", "World")), ["L012"]);
});

test("L013: a store to a read-only place", () => {
  const { d } = only("L013", "(self) => { self.stay = 3; }");
  assert.match(d.tip, /baked/i);
  const r = only("L013", "(w) => { w.frame = 0; }", "timer", "World");
  assert.match(r.d.message, /frame/);
});

test("L014: a signature lowering cannot infer", () => {
  const { d } = only("L014", "(self, n) => { self.ttl = n; }", "method", "Mole", { key: "pop" });
  assert.match(d.message, /n/);
  assert.match(d.tip, /call/i);
});

test("L015: the wrong number of arguments", () => {
  const { d } = only("L015", "(w) => { w.sfx(); }", "timer", "World");
  assert.match(d.tip, /1/);
});
