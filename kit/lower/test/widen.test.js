// The subset widenings Ben ruled on after M1: for…of, destructuring, list indexing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { lower, codes } from "./fixture.js";
import { emitKernel, instantiate } from "../../emit/js/index.js";

/** @import { Kernel, Stmt } from "../../ir/ir.js" */

/**
 * Lowers and asserts success.
 * @param {Parameters<typeof lower>} args
 * @returns {Kernel}
 */
function ok(...args) {
  const r = lower(...args);
  assert.deepEqual(r.diagnostics.filter((d) => d.severity === "error").map((d) => `${d.code} ${d.message}`), []);
  assert.ok(r.kernel);
  return r.kernel;
}

/** A `whack` handler whose payload is `{ cell: f64, pos: { x, y } }`. */
const ON = /** @type {const} */ (["on", "World", { key: "whack", sigs: { events: { whack: { struct: { cell: "f64", pos: { struct: { x: "f64", y: "f64" } } } } }, methods: {} } }]);

/** @param {Stmt[]} body @param {string} k */
const kinds = (body, k) => body.filter((s) => s.k === k);

test("for…of over a list lowers to an each loop with its body", () => {
  const k = ok("(self, w) => { for (const m of w.board) { if (m.up) w.score += 1; } }", "onFrame", "Hammer");
  const [loop] = k.body;
  assert.equal(loop.k, "each");
  if (loop.k !== "each") return;
  assert.equal(loop.name, "m");
  assert.deepEqual(loop.t, { ref: "Mole" });
  assert.equal(loop.max, 9);
  assert.ok(loop.body.length > 0);
  assert.ok(k.effects.includes("write World.score"));
});

test("for…of over a filter result, and break and continue inside it", () => {
  const k = ok("(self, w) => { for (const m of w.board.filter((x) => x.up)) { if (m.ttl > 3) continue; m.up = false; break; } }", "onFrame", "Hammer");
  assert.ok(kinds(k.body, "each").length >= 1);
});

test("a for…of body is checked even though the loop is rejected", () => {
  const r = lower("(self, w) => { for (const m of w.board) { m.nope = 1; } }", "onFrame", "Hammer");
  assert.deepEqual(codes(r), ["L002"]);
});

test("a for…of over something that is not a list is L003, and its body is still checked", () => {
  const r = lower("(self, w) => { for (const m of self.up) { w.bogus = 1; } }", "onFrame", "Mole");
  assert.deepEqual(codes(r), ["L003", "L002"]);
  assert.match(r.diagnostics[0].tip, /list/);
});

test("a for…of whose binding is not const says to use const", () => {
  const r = lower("(self, w) => { for (let m of w.board) { m.up = true; } }", "onFrame", "Hammer");
  assert.deepEqual(codes(r), ["L012"]);
  assert.match(r.diagnostics[0].tip, /const/);
});

test("a for…of binding narrows nothing and its optional items must be checked", () => {
  const r = lower("(self, w) => { for (const m of w.board) { const f = w.board.find((x) => x.up); f.up = true; } }", "onFrame", "Hammer");
  assert.deepEqual(codes(r), ["L008"]);
});

test("the binding is scoped to the loop", () => {
  const r = lower("(self, w) => { for (const m of w.board) { m.up = true; } m.up = false; }", "onFrame", "Hammer");
  assert.deepEqual(codes(r), ["L001"]);
});

test("for…of with a destructured binding takes the item apart, and an entity is not a struct", () => {
  const r = lower("(self, w) => { for (const { up, ttl } of w.board) { w.score += ttl; } }", "onFrame", "Hammer");
  assert.deepEqual(codes(r), ["L003"]);
  const arr = lower("(self, w) => { for (const [a] of w.board) { w.score += 1; } }", "onFrame", "Hammer");
  assert.deepEqual(codes(arr), ["L003"]);
});

test("struct destructuring binds each field with a typed let", () => {
  const k = ok("(w, e) => { const { cell, pos } = e; const { x } = pos; w.next = cell + x; }", ...ON);
  const lets = kinds(k.body, "let");
  assert.ok(lets.some((s) => s.k === "let" && s.name === "cell" && s.t === "f64"));
  assert.ok(lets.some((s) => s.k === "let" && s.name === "x" && s.t === "f64"));
  const cell = lets.find((s) => s.k === "let" && s.name === "cell");
  if (cell?.k !== "let" || cell.value?.k !== "field") return assert.fail("cell reads a field");
  assert.equal(cell.value.name, "cell");
});

test("a renamed field and a nested pattern", () => {
  const k = ok("(w, e) => { const { cell: c, pos: { y } } = e; w.next = c + y; }", ...ON);
  const names = kinds(k.body, "let").map((s) => (s.k === "let" ? s.name : ""));
  assert.ok(names.includes("c") && names.includes("y"));
});

test("destructuring a field the struct lacks is L002", () => {
  const r = lower("(w, e) => { const { nope } = e; }", ...ON);
  assert.deepEqual(codes(r), ["L002"]);
});

test("destructuring a value that is not a struct or list is L003", () => {
  const r = lower("(self) => { const { a } = self.ttl; }", "onFrame", "Mole");
  assert.deepEqual(codes(r), ["L003"]);
});

test("destructured names are declared even when it fails, so uses report nothing more", () => {
  const r = lower("(w, e) => { const { nope } = e; w.next = nope; }", ...ON);
  assert.deepEqual(codes(r), ["L002"]);
});

test("indexing a list gives a possibly-empty item that must be checked", () => {
  const r = lower("(self, w) => { w.board[2].up = true; }", "onFrame", "Hammer");
  assert.deepEqual(codes(r), ["L008"]);
  assert.match(r.diagnostics[0].message, /empty/);
});

test("an indexed item narrows once checked", () => {
  const k = ok("(self, w) => { const m = w.board[w.next]; if (m) m.up = true; if (!m) return; m.ttl = 3; }", "onFrame", "Hammer");
  const decl = k.body[0];
  if (decl.k !== "let") return assert.fail("let");
  assert.deepEqual(decl.t, { opt: { ref: "Mole" } });
  assert.equal(decl.value?.k, "index");
});

test("an indexed number is possibly empty too", () => {
  const r = lower("(self, w) => { w.next = w.board.filter((m) => m.up).length + w.board[0].ttl; }", "onFrame", "Hammer");
  assert.deepEqual(codes(r), ["L008"]);
});

test("the index must be a number", () => {
  const r = lower("(self, w) => { const m = w.board[\"a\"]; }", "onFrame", "Hammer");
  assert.deepEqual(codes(r), ["L003"]);
});

test("the last item: list[list.length - 1]", () => {
  const k = ok("(self, w) => { const up = w.board.filter((m) => m.up); const last = up[up.length - 1]; if (last) last.up = false; }", "onFrame", "Hammer");
  assert.ok(k);
});

test("storing into a list element is still rejected, and a computed name off a list-less object is L009", () => {
  assert.deepEqual(codes(lower("(self, w) => { w.board[0] = w.board[1]; }", "onFrame", "Hammer")), ["L012"]);
  assert.deepEqual(codes(lower("(self, k) => { return self[k]; }", "onFrame", "Mole")).includes("L009"), true);
});

test("tuple destructuring takes items by index, each possibly empty", () => {
  const k = ok("(self, w) => { const [a, b] = w.board; if (a && b) { a.up = b.up; } }", "onFrame", "Hammer");
  const lets = kinds(k.body, "let");
  assert.deepEqual(lets.map((s) => (s.k === "let" ? s.name : "")).slice(0, 3).filter((n) => n === "a" || n === "b"), ["a", "b"]);
  const a = lets.find((s) => s.k === "let" && s.name === "a");
  if (a?.k !== "let") return assert.fail();
  assert.deepEqual(a.t, { opt: { ref: "Mole" } });
  assert.equal(a.value?.k, "index");
});

test("an unchecked tuple item is L008, and a hole skips an item", () => {
  const r = lower("(self, w) => { const [, b] = w.board; b.up = true; }", "onFrame", "Hammer");
  assert.deepEqual(codes(r), ["L008"]);
  const checked = lower("(self, w) => { const [, b] = w.board; if (b) b.up = true; }", "onFrame", "Hammer");
  assert.deepEqual(codes(checked), []);
  const b = checked.kernel?.body.find((s) => s.k === "let" && s.name === "b");
  assert.ok(b?.k === "let" && b.value?.k === "index" && b.value.index.k === "num" && b.value.index.v === 1, "b is the item at index 1: the hole skipped index 0");
});

test("tuple destructuring of something that is not a list is L003", () => {
  assert.deepEqual(codes(lower("(self) => { const [a] = self.ttl; }", "onFrame", "Mole")), ["L003"]);
});

test("each, index and destructuring emit JavaScript that runs like the source", () => {
  const k = ok("(self, w) => { let n = 0; for (const m of w.board) { if (m.up) n += 1; } const [a, b] = w.board; const { cell } = { cell: n }; w.score = n + cell + (w.board[1] ? 100 : 0) + (a && b ? 1000 : 0); }", "onFrame", "Hammer");
  const fn = instantiate(emitKernel(k));
  const board = [{ up: true }, { up: false }, { up: true }];
  /** @type {Record<string, number>} */
  const w = { score: 0 };
  Object.assign(w, { board });
  fn({}, w);
  assert.equal(w.score, 2 + 2 + 100 + 1000);
});
