// Lowering runtime lambdas to kernels: structure, types, effects, spans.
import { test } from "node:test";
import assert from "node:assert/strict";
import { lower, codes } from "./fixture.js";

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

/**
 * Every node in a kernel, depth first.
 * @param {unknown} v
 * @param {Array<Record<string, unknown>>} out
 */
function nodes(v, out = []) {
  if (Array.isArray(v)) { for (const x of v) nodes(x, out); return out; }
  if (v && typeof v === "object") {
    const o = /** @type {Record<string, unknown>} */ (v);
    if (typeof o.k === "string") out.push(o);
    for (const [key, x] of Object.entries(o)) if (key !== "t" && key !== "store") nodes(x, out);
  }
  return out;
}

test("a stateful onFrame lowers to loads, an unwrapped temp, a coercing store, and a compare of the temp", () => {
  const k = ok("(self) => { if (self.up && --self.ttl === 0) self.up = false; }");
  assert.equal(k.space, "entity Mole");
  assert.deepEqual(k.params.map((p) => [p.name, p.t]), [["self", { ref: "Mole" }]]);
  const [outer] = k.body;
  assert.equal(outer.k, "if");
  if (outer.k !== "if") return;
  assert.equal(outer.test.k, "load");
  const [dec, store, inner] = outer.then;
  assert.equal(dec.k, "let");
  assert.equal(store.k, "store");
  if (dec.k !== "let" || store.k !== "store" || inner.k !== "if") return assert.fail("shape");
  assert.deepEqual(store.place.store, { type: "u16" });
  // The compare reads the temp, never a reload: an assignment yields the unwrapped value.
  assert.deepEqual(store.value, { k: "local", name: dec.name, t: "f64", span: store.value.span });
  assert.equal(inner.test.k, "op");
  if (inner.test.k !== "op") return;
  assert.equal(inner.test.op, "eq");
  assert.equal(inner.test.args[0].k, "local");
});

test("statements record their effects and the kernel sums them", () => {
  const k = ok("(self) => { if (self.up && --self.ttl === 0) self.up = false; }");
  assert.deepEqual(k.effects, ["read Mole.up", "read Mole.ttl", "write Mole.ttl", "write Mole.up"]);
  const outer = k.body[0];
  assert.deepEqual(outer.effects, ["read Mole.up"]);
});

test("every node carries a type and a span inside the source", () => {
  const src = "(self, w) => {\n  if (self.rise !== 0) self.rise--;\n  if (!self.up && (w.frame + self.stay) % 150 === 0) self.pop();\n}";
  const k = ok(src, "onFrame", "Mole", { sigs: { events: {}, methods: { "Mole.pop": { arity: 0, params: [], returns: "void", effects: ["write Mole.up"] } } } });
  const all = nodes(k.body);
  assert.ok(all.length > 10);
  for (const n of all) {
    const span = /** @type {[number, number]} */ (n.span);
    assert.ok(Array.isArray(span) && span[0] >= 0 && span[1] <= src.length && span[0] <= span[1], `${n.k} span ${span}`);
    if (!["let", "set", "store", "do", "if", "for", "each", "push", "return", "break", "continue"].includes(String(n.k))) assert.ok(n.t !== undefined, `${n.k} has a type`);
  }
});

test("a statement-position update stores without a temporary", () => {
  const k = ok("(self) => { if (self.rise !== 0) self.rise--; }");
  const s = k.body[0];
  if (s.k !== "if") return assert.fail();
  assert.equal(s.test.k, "op");
  assert.deepEqual(s.then.map((x) => x.k), ["store"]);
});

test("an assignment used as a value yields the right-hand side, and a postfix update yields the old value", () => {
  const k = ok("(self) => { const a = (self.ttl = self.stay * 1000); const b = self.rise--; return a + b; }", "method", "Mole", { key: "pop" });
  const kinds = k.body.map((s) => s.k);
  assert.deepEqual(kinds, ["let", "store", "let", "let", "store", "let", "return"]);
  const [t0, st] = k.body;
  if (t0.k !== "let" || st.k !== "store") return assert.fail();
  assert.equal(st.value.k, "local");
  const a = k.body[2];
  if (a.k !== "let") return assert.fail();
  assert.deepEqual(a.value?.k === "local" && a.value.name, t0.name);
  assert.equal(k.returns, "f64");
});

test("compound assignment loads, operates and stores through the coercion of the place", () => {
  const k = ok("(self, w) => { self.vy += w.param(\"spawn\"); self.x += self.vx; }", "onFrame", "Spark");
  const [a, b] = k.body;
  if (a.k !== "store" || b.k !== "store") return assert.fail();
  assert.deepEqual(a.place.store, { type: "fix" });
  assert.deepEqual(b.place.store, { type: "f64" });
  assert.equal(a.value.k === "op" && a.value.op, "add");
  assert.deepEqual(k.effects, ["read Spark.vy", "read param spawn", "write Spark.vy", "read Spark.x", "read Spark.vx", "write Spark.x"]);
});

test("a world attribute store carries the attribute's bounds", () => {
  const k = ok("(w, pts) => { w.score = w.score + pts; }", "method", "World", { key: "award", sigs: { events: {}, methods: { "World.award": { arity: 1, params: ["f64"], returns: "void", effects: [] } } } });
  const s = k.body[0];
  if (s.k !== "store") return assert.fail();
  assert.deepEqual(s.place.store, { type: "u16", max: 9999 });
  assert.equal(s.place.owner, "World");
});

test("a filter callback inlines as a bounded loop that runs only in its branch", () => {
  const src = "(w) => {\n  const m = w.param(\"order\") === \"sweep\" ? w.board.at(w.next) : w.rng.pick(w.board.filter((m) => !m.up));\n  if (m == null) return;\n  m.up = true;\n}";
  const k = ok(src, "timer", "World");
  const [decl, cond] = k.body;
  assert.equal(decl.k, "let", "the ternary's result is declared ahead of its branches");
  assert.equal(cond.k, "if");
  if (cond.k !== "if") return;
  // The filter's loop lives in the else branch; the then branch only reads the board.
  assert.ok(nodes(cond.else).some((n) => n.k === "each"));
  assert.ok(!nodes(cond.then).some((n) => n.k === "each"));
  const each = /** @type {Extract<Stmt, { k: "each" }>} */ (/** @type {unknown} */ (nodes(cond.else).find((n) => n.k === "each")));
  assert.equal(each.max, 9);
  assert.notEqual(each.name, "m", "the callback's m is renamed apart from the outer m");
  const m = k.locals.find((l) => l.name === "m");
  assert.deepEqual(m?.t, { opt: { ref: "Mole" } });
});

test("find, some, every and reduce lower to loops with the right result types", () => {
  const k = ok("(w) => { const a = w.board.find((m) => m.up); const b = w.board.some((m) => m.up); const c = w.board.every((m) => m.ttl > 0); const d = w.board.reduce((n, m) => n + m.ttl, 0); return d; }", "every", "World");
  const types = Object.fromEntries(k.locals.filter((l) => ["a", "b", "c", "d"].includes(l.name)).map((l) => [l.name, l.t]));
  assert.deepEqual(types, { a: { opt: { ref: "Mole" } }, b: "bool", c: "bool", d: "f64" });
  assert.equal(nodes(k.body).filter((n) => n.k === "each").length, 4);
});

test("a callback reads the enclosing lambda's locals", () => {
  ok("(w) => { const t = 3; return w.board.filter((m) => m.ttl > t).length; }", "every", "World");
});

test("a canonical for loop bounded by a param lowers with its bound named", () => {
  const k = ok("(w, e) => { for (let i = 0; i < w.param(\"burst\"); i++) { const s = w.spawn(\"sparks\", { x: 1 }); if (s == null) break; s.life = 20 + w.rand(20); } }", "on", "World", { key: "burst", sigs: { events: { burst: { struct: { x: "f64" } } }, methods: {} } });
  const f = k.body[0];
  if (f.k !== "for") return assert.fail();
  assert.equal(f.bound, "param burst");
  assert.ok(k.effects.includes("spawn sparks"));
  assert.ok(k.effects.includes("rng"));
});

test("a draw returns sprite names, draw records and null against its declared union", () => {
  ok("(self) => (self.up ? \"up\" : null)", "draw");
  ok("(self) => { if (!self.up) return null; return self.rise > 4 ? { sprite: \"peek\", y: self.y + 8 } : \"up\"; }", "draw");
  ok("(self, w) => ({ x: w.board.at(self.ttl).x, y: w.board.at(self.ttl).y - 8 })", "draw");
});

test("a hud lowers at(c, r).text(fmt, ...args) as dialect calls with the hud effect", () => {
  const k = ok("(w, at) => { at(0, 1).text(\"STAY %d.%dS\", w.param(\"linger\"), (w.param(\"linger\") * 10) % 10); }", "hud", "World");
  const s = k.body[0];
  if (s.k !== "do" || s.value.k !== "call") return assert.fail();
  assert.equal(s.value.fn, "Cell.text");
  assert.equal(s.value.recv?.k === "call" && s.value.recv.fn, "At");
  assert.ok(k.effects.includes("hud"));
});

test("input, grid, emit, sfx and toast resolve through the world", () => {
  const k = ok("(self, w) => { const d = w.input.dpad(); self.cell = w.grid.step(self.cell, d.x, d.y); if (w.input.pressed(\"A\")) w.emit(\"whack\", { cell: self.cell }); w.sfx(\"pop\"); w.toast(\"HI\", \"+1\"); }", "onFrame", "Hammer");
  assert.ok(k.effects.includes("emit whack"));
  assert.ok(k.effects.includes("sfx pop"));
  assert.ok(k.effects.includes("input"));
});

test("Math intrinsics are pure calls on doubles", () => {
  const k = ok("(self, w) => { const a = w.input.axis(); self.x = Math.max(0, Math.min(152, self.x + a.x * 2)); }", "onFrame", "Hammer");
  const s = k.body[1];
  if (s.k !== "store" || s.value.k !== "call") return assert.fail();
  assert.equal(s.value.fn, "Math.max");
  assert.deepEqual(s.value.effects, []);
});

test("a method call on an entity records the call and the callee's effects", () => {
  /** @type {import("../environment.js").Signatures} */
  const sigs = { events: {}, methods: { "Mole.whack": { arity: 0, params: [], returns: "bool", effects: /** @type {import("../../ir/ir.js").Effect[]} */ (["write Mole.up"]) } } };
  const k = ok("(w, e) => { if (w.board.at(e.cell).whack()) w.toast(\"WHACK\", \"+100\"); }", "on", "World", { key: "whack", sigs: { ...sigs, events: { whack: { struct: { cell: "f64" } } } } });
  assert.ok(k.effects.includes("call Mole.whack"));
  assert.ok(k.effects.includes("write Mole.up"));
});

test("narrowing: if (m != null) and if (m == null) return make an optional usable", () => {
  ok("(w) => { const m = w.rng.pick(w.board.filter((m) => !m.up)); if (m != null) { m.up = true; m.ttl = 90; } }", "timer", "World");
  ok("(w) => { const m = w.rng.pick(w.board); if (m == null) return; m.up = true; }", "timer", "World");
  ok("(w) => { const m = w.rng.pick(w.board); if (m != null && m.up) w.sfx(\"pop\"); }", "timer", "World");
});

test("a lambda with a parse or subset error reports those and no kernel", () => {
  const r = lower("(self) => { while (self.up) {} }");
  assert.equal(r.kernel, null);
  assert.deepEqual(codes(r), ["S101"]);
});
