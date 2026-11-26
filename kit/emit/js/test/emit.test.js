// The JS backend: IR kernels to plain functions with the slot's calling convention,
// checked by running them against small stand-ins for the DMG host.
import { test } from "node:test";
import assert from "node:assert/strict";
import { emitKernel, instantiate } from "../index.js";
import { lower } from "../../../lower/test/fixture.js";

/** @import { Kernel } from "../../../ir/ir.js" */
/** @import { Signatures } from "../../../lower/environment.js" */

/**
 * Lowers and emits, asserting both succeed.
 * @param {Parameters<typeof lower>} args
 */
function emit(...args) {
  const r = lower(...args);
  assert.deepEqual(r.diagnostics.filter((d) => d.severity === "error").map((d) => d.message), []);
  const k = /** @type {Kernel} */ (r.kernel);
  const out = emitKernel(k);
  return { k, out, fn: instantiate(out) };
}

/**
 * An entity stand-in whose stores coerce like the DMG proxy: u16 wraps, bool is !!v.
 * @param {Record<string, unknown>} v
 * @param {Record<string, "u8" | "u16" | "bool">} types
 */
function entity(v, types) {
  return new Proxy(v, {
    set(o, k, val) {
      const t = types[/** @type {string} */ (k)];
      const span = t === "u8" ? 256 : 65536;
      o[/** @type {string} */ (k)] = t === "bool" ? !!val : t ? ((Math.trunc(Number(val)) % span) + span) % span : val;
      return true;
    },
  });
}

test("the emitted function takes the lambda's own parameters and compares the unwrapped value", () => {
  const { out, fn } = emit("(self) => { if (self.up && --self.ttl === 0) self.up = false; }");
  assert.deepEqual(out.params, ["self"]);
  const a = entity({ up: true, ttl: 1 }, { up: "bool", ttl: "u16" });
  fn(a);
  assert.deepEqual({ ...a }, { up: false, ttl: 0 });
  const b = entity({ up: true, ttl: 0 }, { up: "bool", ttl: "u16" });
  fn(b);
  assert.deepEqual({ ...b }, { up: true, ttl: 65535 }, "−1 is compared, 65535 stored");
});

test("operators keep JavaScript's precedence and meaning", () => {
  const { fn } = emit("(w, at) => { at(0, 0).text(\"%d\", (w.score - 1) * 2 % 7, -(w.score ** 2), w.score + \"!\"); }", "hud", "World");
  /** @type {unknown[]} */
  let got = [];
  fn({ score: 10 }, () => ({ text: (/** @type {unknown[]} */ ...a) => { got = a; } }));
  assert.deepEqual(got, ["%d", ((10 - 1) * 2) % 7, -(10 ** 2), "10!"]);
});

test("a ternary evaluates only the branch taken, and queries inline as loops", () => {
  const src = "(w) => { const m = w.param(\"order\") === \"sweep\" ? w.board.at(w.next) : w.rng.pick(w.board.filter((m) => !m.up)); w.next = (w.next + 1) % 9; if (m == null) return; m.up = true; }";
  const { out, fn } = emit(src, "timer", "World");
  assert.doesNotMatch(out.source, /=>/, "no closure exists at run time");
  assert.match(out.source, /^ {2}if \(w\.param\("order"\) === "sweep"\) \{$/m, "a statement's own expression drops its outer parentheses");
  assert.match(out.source, /^ {2}w\.next = \(w\.next \+ 1\) % 9;$/m);
  /** @type {unknown[]} */
  const picked = [];
  const board = Object.assign([{ up: true }, { up: false }, { up: false }], { at: (/** @type {number} */ i) => board[i] });
  const w = { next: 4, param: () => "random", board, rng: { pick: (/** @type {unknown[]} */ xs) => { picked.push(xs); return xs[1]; } } };
  fn(w);
  assert.deepEqual(picked, [[board[1], board[2]]]);
  assert.equal(board[2].up, true);
  assert.equal(w.next, 5);
  w.param = () => "sweep";
  fn(w);
  assert.equal(picked.length, 1, "the sweep branch never filters or draws");
});

test("find yields undefined when nothing matches; some, every and reduce", () => {
  const { fn } = emit("(w) => { const a = w.board.find((m) => m.ttl > 5); const b = w.board.some((m) => m.up); const c = w.board.every((m) => m.up); const d = w.board.reduce((n, m) => n + m.ttl, 0); return (a != null ? a.ttl * 1000 : 0) + (b ? 100 : 0) + (c ? 10 : 0) + d; }", "every", "World");
  const board = Object.assign([{ up: true, ttl: 1 }, { up: false, ttl: 2 }], { at: () => null });
  assert.equal(fn({ board }), 100 + 3);
  board[1].ttl = 9;
  assert.equal(fn({ board }), 9000 + 100 + 10);
  board[0].ttl = 7;
  assert.equal(fn({ board }), 7000 + 100 + 16, "find yields the first match");
  board[1].up = true;
  assert.equal(fn({ board }), 7000 + 100 + 10 + 16);
});

test("a counted loop with break, spawn, struct literals and a postfix value", () => {
  /** @type {Signatures} */
  const sigs = { events: { burst: { struct: { x: "f64", y: "f64" } } }, methods: {} };
  const { fn } = emit("(w, e) => { for (let i = 0; i < w.param(\"burst\"); i++) { const s = w.spawn(\"sparks\", { x: e.x, y: e.y }); if (s == null) break; s.life = 20 + w.rand(20); } }", "on", "World", { key: "burst", sigs });
  /** @type {Array<Record<string, unknown>>} */
  const spawned = [];
  const w = { param: () => 5, rand: () => 3, spawn: (/** @type {string} */ _p, /** @type {Record<string, unknown>} */ init) => (spawned.length < 2 ? (spawned.push({ ...init }), spawned[spawned.length - 1]) : null) };
  fn(w, { x: 7, y: 8 });
  assert.deepEqual(spawned, [{ x: 7, y: 8, life: 23 }, { x: 7, y: 8, life: 23 }]);
  const post = emit("(self) => { const a = self.rise--; self.ttl = a; }").fn;
  const e = entity({ rise: 0, ttl: 0 }, { rise: "u8", ttl: "u16" });
  post(e);
  assert.deepEqual({ ...e }, { rise: 255, ttl: 0 });
});

test("method calls, emits and draw results pass through to the host", () => {
  /** @type {Signatures} */
  const sigs = { events: {}, methods: { "Mole.pop": { arity: 0, params: [], returns: "void", effects: [] } } };
  const { fn } = emit("(self, w) => { if (!self.up && (w.frame + self.stay) % 150 === 0) self.pop(); w.emit(\"whack\", { cell: self.ttl }); }", "onFrame", "Mole", { sigs });
  /** @type {unknown[]} */
  const log = [];
  fn({ up: false, stay: 0, ttl: 3, pop: () => log.push("pop") }, { frame: 300, emit: (/** @type {string} */ n, /** @type {unknown} */ d) => log.push(n, d) });
  assert.deepEqual(log, ["pop", "whack", { cell: 3 }]);
  const draw = emit("(self) => { if (!self.up) return null; return self.rise > 4 ? { sprite: \"peek\", y: self.y + 8 } : \"up\"; }", "draw").fn;
  assert.deepEqual(draw({ up: true, rise: 5, y: 10 }), { sprite: "peek", y: 18 });
  assert.equal(draw({ up: true, rise: 0, y: 10 }), "up");
  assert.equal(draw({ up: false }), null);
});

test("every emitted line maps back to a source span, and statements to their own", () => {
  const src = "(self) => {\n  if (self.up && --self.ttl === 0)\n    self.up = false;\n}";
  const { out } = emit(src);
  const lines = out.source.split("\n");
  assert.equal(out.lines.length, lines.length);
  for (const m of out.lines) assert.ok(m.span[0] >= 0 && m.span[1] <= src.length && m.span[0] < m.span[1]);
  const store = lines.findIndex((l) => l.includes("self.up = false"));
  assert.equal(src.slice(...out.lines[store].span), "self.up = false");
  assert.deepEqual(out.lines[store].start, { line: 3, column: 4 });
});

test("each statement's line maps to the whole statement, not to its value", () => {
  const src = "(self, w) => {\n  let a = 0;\n  a = self.ttl + 1;\n  w.score = a * 2;\n  if (a > 3) return;\n}";
  const { out } = emit(src);
  const lines = out.source.split("\n");
  /** @param {string} text */
  const spanOf = (text) => src.slice(...out.lines[lines.findIndex((l) => l.includes(text))].span);
  assert.equal(spanOf("let a = 0"), "a = 0");
  assert.equal(spanOf("a = self.ttl + 1"), "a = self.ttl + 1");
  assert.equal(spanOf("w.score = a * 2"), "w.score = a * 2");
  assert.equal(spanOf("if (a > 3)"), "if (a > 3) return;");
  assert.equal(spanOf("return;"), "return;");
  assert.deepEqual(out.lines[lines.findIndex((l) => l.includes("a = self.ttl + 1"))].start, { line: 3, column: 2 });
});
