// Regression tests from the independent review of the IR leaf: loop bounds, callback
// purity, effects through methods, reason codes, writable world built-ins, and ops.
import { test } from "node:test";
import assert from "node:assert/strict";
import { lower, codes, environment } from "./fixture.js";
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
  const subsetFail = lowerProgram(environment, [method("(self) => { self.up = true; return `${self.ttl}`; }"), draw]);
  assert.deepEqual(codes(subsetFail.results[1]), ["L014"]);
  const lowerFail = lowerProgram(environment, [method("(self) => { const k = nope; self.ttl = 1; }"), draw]);
  assert.ok(codes(lowerFail.results[1]).includes("L014"), "the write it did lower is reported too, but its effects are not complete");
  const partialRead = lowerProgram(environment, [method("(self) => { const k = nope; return self.up; }"), draw]);
  assert.deepEqual(codes(partialRead.results[1]), ["L014"]);
  const writes = lowerProgram(environment, [method("(self) => { self.up = true; }"), draw]);
  assert.deepEqual(codes(writes.results[1]), ["L004"]);
  const reads = lowerProgram(environment, [method("(self) => { return self.up; }"), draw]);
  assert.deepEqual(codes(reads.results[1]), []);
  const onFrame = { src: "(self, w) => { self.pop(); }", slot: { id: "Mole.onFrame#0", kind: "onFrame", on: "Mole" } };
  const tick = lowerProgram(environment, [method("(self) => { const k = nope; self.up = true; }"), onFrame]);
  assert.deepEqual(codes(tick.results[1]), [], "a slot that forbids nothing needs no effects proved");
});

test("a method that calls itself, directly or through another, is unbounded", () => {
  const m = (/** @type {string} */ key, /** @type {string} */ src) => ({ src, slot: { id: `Mole.method(${key})`, kind: "method", on: "Mole", key } });
  const onFrame = { src: "(self, w) => { self.pop(); }", slot: { id: "Mole.onFrame#0", kind: "onFrame", on: "Mole" } };
  const direct = lowerProgram(environment, [m("pop", "(self) => { if (self.up) self.pop(); }"), onFrame]);
  assert.deepEqual(codes(direct.results[0]), ["L007"]);
  const mutual = lowerProgram(environment, [m("pop", "(self) => { self.whack(); }"), m("whack", "(self) => { self.pop(); }"), onFrame]);
  assert.deepEqual(codes(mutual.results[0]), ["L007"]);
  assert.deepEqual(codes(mutual.results[1]), [], "one L007 per cycle, at its least key (review of 8ad7338, L2)");
  const chain = lowerProgram(environment, [m("pop", "(self) => { self.whack(); }"), m("whack", "(self) => { self.up = false; }"), onFrame]);
  assert.deepEqual(chain.results.map(codes), [[], [], []]);
});

test("an indexed list item is possibly empty (L008) until checked; a dynamic name is L009", () => {
  const r = lower("(self, w) => { w.board[0].up = true; }");
  assert.deepEqual(codes(r), ["L008"]);
  assert.deepEqual(codes(lower("(self, w) => { w.score = w.board[1].ttl; }")), ["L008"]);
  assert.deepEqual(codes(lower("(self, w) => { w.board[0].pop(); }")), ["L008"]);
  assert.deepEqual(codes(lower("(self, w) => { const m = w.board[0]; if (m != null) m.pop(); }")), []);
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

test("a null check tests a possibly-empty entity as present; truthiness of any other value is refused", () => {
  const ops = (/** @type {Kernel} */ k) => printKernel(k).match(/\b(present|truthy)\b/g) ?? [];
  assert.deepEqual(ops(ok("(self, w) => { const m = w.rng.pick(w.board); if (m != null) m.pop(); }")), ["present"]);
  assert.deepEqual(codes(lower("(self, w) => { const v = self.up ? 0 : null; if (v) w.score = 1; }")), ["L003"]);
  assert.deepEqual(codes(lower("(self, w) => { if (self.ttl) w.score = 1; }")), ["L003"]);
  const prog = lowerProgram(environment, [
    { src: "(self) => { if (self.up) return false; }", slot: { id: "Mole.method(whack)", kind: "method", on: "Mole", key: "whack" } },
    { src: "(self, w) => { if (self.whack()) w.score = 1; }", slot: { id: "Mole.onFrame#0", kind: "onFrame", on: "Mole" } },
  ]);
  assert.deepEqual(prog.results[1].diagnostics.map((d) => d.code), ["L003"], "a method that may return nothing is not a bool");
});

test("a name read in its own temporal dead zone is rejected, where it would read the outer name", () => {
  for (const src of [
    "(self, w) => { const x = { a: 1 }; { const { a: x } = x; self.ttl = x; } }",
    "(self, w) => { const x = [4, 5]; { const [x] = x; if (!x) return; self.ttl = x; } }",
    "(self, w) => { const m = [1]; for (const m of m) { self.ttl = m; } }",
    "(self, w) => { const x = 1; { const x = x + 1; self.ttl = x; } }",
    "(self, w) => { const x = x + 1; self.ttl = x; }",
    "(self, w) => { const { a, b: c } = { a: 1, b: a }; self.ttl = c; }",
  ]) {
    const r = lower(src);
    assert.equal(r.ok, false, src);
    assert.deepEqual(codes(r), ["L001"], src);
    assert.match(r.diagnostics[0].message, /before|initializer|its own/, src);
  }
});

test("a callback parameter or a later declaration may reuse a name that is still being declared", () => {
  for (const src of [
    "(self, w) => { const m = w.board.find((m) => m.up); if (m == null) return; self.ttl = m.ttl; }",
    "(self, w) => { const x = 1; const y = x + 1; self.ttl = y; }",
    "(self, w) => { const x = 1; { const x = 2; self.ttl = x; } }",
    "(self, w) => { for (const m of w.board) { self.ttl = m.ttl; } }",
  ]) assert.deepEqual(codes(lower(src)), [], src);
});

test("the dead zone runs from the start of the block: a read before a later declaration never reads an outer name", () => {
  for (const src of [
    "(self, w) => { const x = 1; { const y = x + 1; const x = 2; self.ttl = y + x; } }",
    "(self, w) => { const b = 5; { const a = b, b = 1; self.ttl = a + b; } }",
    "(self, w) => { const n = 3; { const m = w.board.find((e) => e.ttl > n); const n = 1; if (m == null) return; self.ttl = n; } }",
    "(self, w) => { const x = 1; { { self.ttl = x; } const x = 2; } }",
    "(self, w) => { const x = 1; { for (const m of w.board) { self.ttl = x + m.ttl; } const x = 2; } }",
    "(self, w) => { self.ttl = x; const x = 1; }",
  ]) {
    const r = lower(src);
    assert.equal(r.ok, false, src);
    assert.deepEqual(codes(r), ["L001"], src);
    assert.match(r.diagnostics[0].message, /before its declaration finishes/, src);
  }
});

test("blocks keep their own names: siblings do not interfere, later reads are fine, and let and narrowing still work", () => {
  for (const src of [
    "(self, w) => { { const x = 1; self.ttl = x; } { const x = 2; self.ttl = self.ttl + x; } }",
    "(self, w) => { const x = 1; { const x = 2; self.ttl = x; } self.ttl = self.ttl + x; }",
    "(self, w) => { { const x = 1; self.ttl = x; } const x = 2; self.ttl = self.ttl + x; }",
    "(self, w) => { let x = 0; if (self.up) { x = 5; } self.ttl = x; }",
    "(self, w) => { const m = w.rng.pick(w.board); if (m == null) return; const y = m.ttl; self.ttl = y; }",
  ]) {
    assert.deepEqual(codes(lower(src)), [], src);
  }
});
