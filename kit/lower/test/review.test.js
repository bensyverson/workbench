// Regression tests from the independent review of the IR leaf: loop bounds, callback
// purity, effects through methods, reason codes, writable world built-ins, and ops.
import { test } from "node:test";
import assert from "node:assert/strict";
import { lower, codes, dialect } from "./fixture.js";
import { lowerProgram } from "../index.js";
import { printKernel } from "../../ir/index.js";

/** @import { Kernel, Stmt } from "../../ir/ir.js" */

/**
 * Lowers `src` and asserts it lowers cleanly.
 * @param {Parameters<typeof lower>} args
 */
function ok(...args) {
  const r = lower(...args);
  assert.deepEqual(r.diagnostics.map((d) => `${d.code} ${d.message}`), [], args[0]);
  return /** @type {Kernel} */ (r.kernel);
}

/**
 * Every statement in `stmts`, depth first.
 * @param {Stmt[]} stmts
 * @returns {Stmt[]}
 */
const all = (stmts) => stmts.flatMap((s) => [s, ...(s.k === "if" ? [...all(s.then), ...all(s.else)] : s.k === "for" || s.k === "each" ? all(s.body) : [])]);

test("a for loop's counter must start at an integer literal or a param", () => {
  assert.deepEqual(codes(lower("(self, w) => { for (let i = -1e17; i < 4; i++) { w.score = 1; } }")), ["L007"]);
  assert.deepEqual(codes(lower("(self, w) => { for (let i = -self.ttl * 1e16; i < 4; i++) { w.score = 1; } }")), ["L007"]);
  assert.deepEqual(codes(lower("(self, w) => { for (let i = 0.5; i < 4; i++) { w.score = 1; } }")), ["L007"]);
  ok("(self, w) => { for (let i = 0; i < w.param(\"burst\"); i++) { w.score = 1; } }");
  ok("(self, w) => { for (let dy = -1; dy <= 1; dy++) { w.score = dy; } }");
  ok("(self, w) => { for (let i = w.param(\"spawn\"); i < 9; i += 1) { w.score = i; } }");
});

test("a for loop's constant bound must be one an integer counter reaches", () => {
  assert.deepEqual(codes(lower("(self, w) => { for (let i = 0; i < 1e308; i++) { w.score = 1; } }")), ["L007"]);
  assert.deepEqual(codes(lower("(self, w) => { for (let i = 0; i <= 9007199254740993; i++) { w.score = 1; } }")), ["L007"]);
  ok("(self, w) => { for (let i = 0; i < 300; i++) { w.score = 1; } }");
});

test("a query callback may not assign a local of the enclosing lambda", () => {
  assert.deepEqual(codes(lower("(self, w) => { let n = 0; const l = w.board.filter((m) => (n = n + 1) > 2); w.score = n + l.length; }")), ["L006"]);
  assert.deepEqual(codes(lower("(self, w) => { let n = 0; const l = w.board.some((m) => n++ > 2); w.score = n; }")), ["L006"]);
  ok("(self, w) => { const k = 2; w.score = w.board.filter((m) => m.ttl >= k).length; }");
  ok("(self, w) => { let k = 2; w.score = w.board.filter((m) => m.ttl >= k).length; k = 3; }");
});

test("a render slot calling a method that failed to lower cannot be shown effect-free", () => {
  const draw = { src: "(self) => { self.pop(); return \"up\"; }", slot: { id: "Mole.draw", kind: "draw", on: "Mole" } };
  const method = (/** @type {string} */ src) => ({ src, slot: { id: "Mole.method(pop)", kind: "method", on: "Mole", key: "pop" } });
  const subsetFail = lowerProgram(dialect, [method("(self) => { self.up = true; return `${self.ttl}`; }"), draw]);
  assert.deepEqual(codes(subsetFail.results[1]), ["L014"]);
  const lowerFail = lowerProgram(dialect, [method("(self) => { const k = nope; self.ttl = 1; }"), draw]);
  assert.ok(codes(lowerFail.results[1]).includes("L014"), "the write it did lower is reported too, but its effects are not complete");
  const partialRead = lowerProgram(dialect, [method("(self) => { const k = nope; return self.up; }"), draw]);
  assert.deepEqual(codes(partialRead.results[1]), ["L014"]);
  const writes = lowerProgram(dialect, [method("(self) => { self.up = true; }"), draw]);
  assert.deepEqual(codes(writes.results[1]), ["L004"]);
  const reads = lowerProgram(dialect, [method("(self) => { return self.up; }"), draw]);
  assert.deepEqual(codes(reads.results[1]), []);
  const onFrame = { src: "(self, w) => { self.pop(); }", slot: { id: "Mole.onFrame#0", kind: "onFrame", on: "Mole" } };
  const tick = lowerProgram(dialect, [method("(self) => { const k = nope; self.up = true; }"), onFrame]);
  assert.deepEqual(codes(tick.results[1]), [], "a slot that forbids nothing needs no effects proved");
});

test("a method that calls itself, directly or through another, is unbounded", () => {
  const m = (/** @type {string} */ key, /** @type {string} */ src) => ({ src, slot: { id: `Mole.method(${key})`, kind: "method", on: "Mole", key } });
  const onFrame = { src: "(self, w) => { self.pop(); }", slot: { id: "Mole.onFrame#0", kind: "onFrame", on: "Mole" } };
  const direct = lowerProgram(dialect, [m("pop", "(self) => { if (self.up) self.pop(); }"), onFrame]);
  assert.deepEqual(codes(direct.results[0]), ["L007"]);
  const mutual = lowerProgram(dialect, [m("pop", "(self) => { self.whack(); }"), m("whack", "(self) => { self.pop(); }"), onFrame]);
  assert.deepEqual(codes(mutual.results[0]), ["L007"]);
  assert.deepEqual(codes(mutual.results[1]), ["L007"]);
  const chain = lowerProgram(dialect, [m("pop", "(self) => { self.whack(); }"), m("whack", "(self) => { self.up = false; }"), onFrame]);
  assert.deepEqual(chain.results.map(codes), [[], [], []]);
});

test("an indexed list item is possibly empty (L008) until checked; a dynamic name is L009", () => {
  const r = lower("(self, w) => { w.board[0].up = true; }");
  assert.deepEqual(codes(r), ["L008"]);
  assert.deepEqual(codes(lower("(self, w) => { w.score = w.board[1].ttl; }")), ["L008"]);
  assert.deepEqual(codes(lower("(self, w) => { w.board[0].pop(); }")), ["L008"]);
  assert.deepEqual(codes(lower("(self, w) => { const m = w.board[0]; if (m) m.pop(); }")), []);
  assert.deepEqual(codes(lower("(self) => { const k = \"up\"; self[k] = false; }")), ["L009"]);
  assert.deepEqual(codes(lower("(self) => { const k = \"pop\"; self[k](); }")), ["L009"]);
});

test("the world's oamStart and over are writable, as the runtime's world allows", () => {
  const a = ok("(self, w) => { w.oamStart = 4; }");
  const sa = all(a.body).find((s) => s.k === "store");
  assert.ok(sa && sa.k === "store");
  assert.deepEqual(sa.place.store, { type: "u8" });
  assert.deepEqual(sa.effects, ["write World.oamStart"]);
  const b = ok("(self, w) => { w.over = true; }");
  const sb = all(b.body).find((s) => s.k === "store");
  assert.ok(sb && sb.k === "store");
  assert.deepEqual(sb.place.store, { type: "bool" });
  assert.deepEqual(codes(lower("(self, w) => { w.over = true; return \"up\"; }", "draw")), ["L004"]);
  assert.deepEqual(codes(lower("(self, w) => { w.frame = 0; }")), ["L013"]);
});

test("a void call returned from a void slot lowers; a value still does not", () => {
  const k = ok("(self, w) => { return w.end(\"crash\"); }");
  assert.deepEqual(k.body.map((s) => s.k), ["do", "return"]);
  assert.deepEqual(codes(lower("(self, w) => { return 5; }")), ["L003"]);
  assert.deepEqual(codes(lower("(self, w) => { return self.ttl; }")), ["L003"]);
});

test("present tests a possibly-empty entity; any other value tests truthiness", () => {
  const ops = (/** @type {Kernel} */ k) => printKernel(k).match(/\b(present|truthy)\b/g) ?? [];
  assert.deepEqual(ops(ok("(self, w) => { const m = w.rng.pick(w.board); if (m) m.pop(); }")), ["present"]);
  assert.deepEqual(ops(ok("(self, w) => { const v = self.up ? 0 : null; if (v) w.score = 1; }")), ["truthy"]);
  assert.deepEqual(ops(ok("(self, w) => { if (self.ttl) w.score = 1; }")), ["truthy"]);
  const prog = lowerProgram(dialect, [
    { src: "(self) => { if (self.up) return false; }", slot: { id: "Mole.method(whack)", kind: "method", on: "Mole", key: "whack" } },
    { src: "(self, w) => { if (self.whack()) w.score = 1; }", slot: { id: "Mole.onFrame#0", kind: "onFrame", on: "Mole" } },
  ]);
  assert.deepEqual(ops(/** @type {Kernel} */ (prog.results[1].kernel)), ["truthy"]);
});
