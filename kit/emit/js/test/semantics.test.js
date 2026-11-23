// Differential tests of lowering plus the JS backend: each lambda runs twice, as the
// original closure and as the emitted function, on identical stand-in worlds that log
// every call, and the two runs must agree on the log, the result and the final state.
import { test } from "node:test";
import assert from "node:assert/strict";
import { emitKernel, instantiate } from "../index.js";
import { lower, dialect } from "../../../lower/test/fixture.js";
import { lowerProgram } from "../../../lower/index.js";

/** @import { Kernel } from "../../../ir/ir.js" */

/**
 * A stand-in world: four moles on a board, a counting RNG, and intrinsics that log.
 * @param {string[]} log
 */
function world(log) {
  let r = 0;
  /** @param {number} i */
  const mole = (i) => ({
    i, up: false, ttl: 3 + i, rise: 0, stay: 5, group: i === 0 ? "" : "g",
    pop() { log.push(`pop ${i}`); this.up = true; },
    whack() { log.push(`whack ${i}`); return this; },
  });
  const board = Object.assign([0, 1, 2, 3].map(mole), {
    at(/** @type {number} */ i) { log.push(`at ${i}`); return board[i]; },
  });
  const w = {
    next: 0, score: 0, secs: 0, frame: 1, board,
    rng: {
      int(/** @type {number} */ n) { const v = r++ % n; log.push(`int ${n}->${v}`); return v; },
      chance(/** @type {number} */ _p) { const v = r++ % 2 === 0; log.push(`chance->${v}`); return v; },
      pick(/** @type {any[]} */ l) { const v = l.length ? l[r++ % l.length] : undefined; log.push(`pick->${v?.i}`); return v; },
    },
    rand() { log.push("rand"); return 0.5; },
    all() { log.push("all"); return board.slice(); },
    emit(/** @type {string} */ n, /** @type {unknown} */ p) { log.push(`emit ${n} ${JSON.stringify(p)}`); },
    sfx(/** @type {string} */ n) { log.push(`sfx ${n}`); },
    toast(/** @type {unknown} */ a) { log.push(`toast ${JSON.stringify(a)}`); },
    param(/** @type {string} */ n) { return n === "burst" ? 3 : 2; },
    end(/** @type {string} */ why) { log.push(`end ${why}`); },
  };
  return w;
}

/**
 * Runs `fn` on a fresh world and records what it did.
 * @param {(...a: any[]) => unknown} fn
 * @param {string} kind
 * @param {string} on
 */
function run(fn, kind, on) {
  /** @type {string[]} */
  const log = [];
  const w = world(log);
  const self = on === "World" ? w : w.board[0];
  let ret, err;
  try { ret = kind === "timer" || kind === "done" ? fn(w, w) : fn(self, w); } catch (e) { err = String(e); }
  const state = { board: w.board.map((m) => [m.up, m.ttl, m.rise]), score: w.score, next: w.next };
  return { ret, err, log, state };
}

/**
 * Lowers and emits `src`, then asserts the emitted function behaves as the original.
 * @param {string} src
 * @param {string} [kind]
 * @param {string} [on]
 */
function same(src, kind = "onFrame", on = "Mole") {
  const r = lower(src, kind, on);
  assert.deepEqual(r.diagnostics.map((d) => `${d.code} ${d.message}`), [], src);
  const emitted = emitKernel(/** @type {Kernel} */ (r.kernel));
  const want = run((0, eval)(src), kind, on);
  const got = run(instantiate(emitted), kind, on);
  assert.deepEqual(got, want, `${src}\n${emitted.source}`);
  return want;
}

test("a compound assignment or update evaluates its receiver once", () => {
  const draws = (/** @type {string[]} */ log) => log.filter((l) => l.startsWith("int")).length;
  assert.equal(draws(same("(self, w) => { w.board.at(w.rng.int(4)).ttl += 30; }").log), 1);
  assert.equal(draws(same("(self, w) => { w.board.at(w.rng.int(4)).ttl--; }").log), 1);
  same("(self, w) => { const n = w.board.at(w.rng.int(4)).ttl++; w.score = n; }");
  same("(self, w) => { w.score = ++w.board.at(w.rng.int(4)).ttl; }");
  same("(self, w) => { (w.rng.chance(0.5) ? self : w.board.at(1)).ttl -= 1; }");
  same("(self, w) => { w.board.at(w.rng.int(4)).ttl = 9; }");
});

test("a compound assignment reads its target before evaluating the right side", () => {
  assert.equal(same("(self, w) => { self.ttl += (self.ttl = 5); }").state.board[0][1], 8);
  same("(self, w) => { self.ttl -= self.ttl--; }");
  assert.equal(same("(self, w) => { let a = 1; a += (a = 5); w.score = a; }").state.score, 6);
  same("(self, w) => { let a = 1; a += a++; w.score = a; }");
  same("(self, w) => { let a = 1; w.score = a + (a = 5) + a; }");
  same("(self, w) => { w.score = 100; w.score -= 7; self.ttl *= 3; }");
  assert.equal(same("(self, w) => { let a = 10; a -= 3; a *= 2; a %= 5; w.score = a; }").state.score, 4);
});

test("updates and assignments yield the value JavaScript gives", () => {
  same("(self, w) => { if (--self.ttl === 2) self.up = true; }");
  same("(self, w) => { w.score = self.ttl++ + self.ttl; }");
  same("(self, w) => { w.score = (self.ttl = 7) + self.ttl; }");
  same("(self, w) => { w.score = self.ttl + (self.ttl = 7); }");
  same("(self, w) => { w.score = self.ttl + self.ttl++; }");
  same("(self, w) => { w.next = w.score = 4; }");
});

test("logical operators and ternaries evaluate only what JavaScript evaluates", () => {
  same("(self, w) => { const a = self.up && w.rng.chance(0.5); w.score = a ? 1 : 2; }");
  same("(self, w) => { const a = self.up || w.rng.chance(0.5); w.score = a ? 1 : 2; }");
  same("(self, w) => { const a = self.up && self.ttl-- > 0; w.score = a ? 1 : 2; }");
  same("(self, w) => { const a = !self.up || self.ttl-- > 0; w.score = a ? 1 : 2; }");
  same("(self, w) => { w.score = self.up ? w.rng.int(5) : self.ttl--; }");
  same("(self, w) => { w.score = !self.up ? w.rng.int(5) : self.ttl--; }");
  same("(self, w) => { self.up || w.emit(\"x\", { a: 1 }); }");
  same("(self, w) => { !self.up || w.emit(\"y\", { a: 2 }); }");
  same("(self, w) => { self.ttl > 2 && self.pop(); }");
  same("(self, w) => { if (self.ttl > 2 && self.ttl-- > 0) w.score = 1; }");
  same("(self, w) => { if (self.ttl > 9 && self.ttl-- > 0) w.score = 1; else w.score = 2; }");
  same("(self, w) => { if (self.ttl > 9 || self.ttl-- > 0) w.score = 1; else w.score = 2; }");
});

test("queries: find stops at the first match and yields undefined for none; empty some and every", () => {
  assert.equal(same("(self, w) => { const m = w.board.find((m) => m.ttl > 3); if (m) w.score = m.ttl; }").state.score, 4);
  assert.equal(same("(self, w) => { const m = w.board.find((m) => m.ttl > 99); w.score = m === null ? 1 : 2; }").state.score, 2);
  assert.equal(same("(self, w) => { w.score = w.board.filter((m) => false).every((m) => m.up) ? 1 : 2; }").state.score, 1);
  assert.equal(same("(self, w) => { w.score = w.board.filter((m) => false).some((m) => true) ? 1 : 2; }").state.score, 2);
  same("(self, w) => { w.score = w.board.filter((m) => m.up).length; }");
  same("(self, w) => { w.score = w.board.reduce((a, m) => a + m.ttl, 10); }");
  same("(self, w) => { const free = w.board.filter((m) => !m.up); const m = w.rng.pick(free); if (m) m.pop(); }");
  same("(self, w) => { w.score = w.board.reduce((acc, m) => acc + m.ttl, w.rng.int(5)); }");
  same("(self, w) => { const k = 4; w.score = w.board.filter((m) => m.ttl >= k).length; }");
});

test("truthiness is JavaScript's: zero, the empty string and NaN are false", () => {
  same("(self, w) => { if (self.rise) w.score = 1; else w.score = 2; }");
  same("(self, w) => { w.score = !self.rise ? 3 : 4; }");
  assert.equal(same("(self, w) => { if (self.group) w.score = 1; else w.score = 2; }").state.score, 2);
  assert.equal(same("(self, w) => { if (self.rise / self.rise) w.score = 1; else w.score = 2; }").state.score, 2);
});

test("loops honor <, <=, break and continue", () => {
  assert.equal(same("(self, w) => { for (let i = 0; i <= w.board.length; i++) { w.score += 1; } }").state.score, 5);
  same("(self, w) => { for (let i = 0; i < 4; i++) { if (i === 1) continue; w.score += i; } }");
  same("(self, w) => { for (let i = 0; i < w.param(\"burst\"); i++) { if (i === 2) break; w.score += i; } }");
  same("(self, w) => { for (let dy = -1; dy <= 1; dy++) { w.score += dy + 2; } }");
});

test("string concatenation keeps JavaScript's grouping", () => {
  assert.deepEqual(same("(self, w) => { w.toast(self.ttl + (self.ttl + \"x\")); }").log, ["toast \"33x\""]);
  same("(self, w) => { w.toast(\"a\" + self.ttl + self.ttl); }");
  same("(self, w) => { w.toast((self.ttl + self.ttl) + \"a\"); }");
});

test("returns: done, draw, and a void call returned from a void slot", () => {
  same("(w) => w.score > 0", "done", "World");
  same("(w) => { if (w.score > 0) return true; }", "done", "World");
  same("(self, w) => self.up ? \"up\" : null", "draw");
  same("(self, w) => { if (self.up) return \"up\"; }", "draw");
  same("(self, w) => { self.ttl = -1; return; }");
  assert.deepEqual(same("(self, w) => { if (self.ttl > 0) return w.end(\"crash\"); w.score = 1; }").log, ["end crash"]);
});

test("reduce evaluates its list before its initial value", () => {
  const lambdas = [
    { src: "(self) => { self.world.sfx(\"pop\"); return self.world.board.filter((m) => m.up); }", slot: { id: "Mole.method(pop)", kind: "method", on: "Mole", key: "pop" } },
    { src: "(self, w) => { w.score = self.pop().reduce((a, m) => a + 1, w.rng.int(3)); }", slot: { id: "Mole.onFrame#0", kind: "onFrame", on: "Mole" } },
  ];
  const { results } = lowerProgram(dialect, lambdas);
  const k = /** @type {Kernel} */ (results[1].kernel);
  assert.ok(k, results[1].diagnostics.map((d) => d.message).join("; "));
  /** @type {string[]} */
  const log = [];
  const make = () => {
    const w = { score: 0, rng: { int: () => { log.push("rng"); return 1; } }, sfx: (/** @type {string} */ s) => log.push(`sfx ${s}`), board: [{ up: true }] };
    const self = { world: w, pop() { w.sfx("pop"); return w.board.filter((m) => m.up); } };
    return [self, w];
  };
  (0, eval)(lambdas[1].src)(...make());
  const want = log.splice(0);
  instantiate(emitKernel(k))(...make());
  assert.deepEqual(log, want);
  assert.deepEqual(want, ["sfx pop", "rng"]);
});
