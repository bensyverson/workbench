// Top-level program helpers lowered as program functions, and top-level constants baked in.
import { test } from "node:test";
import assert from "node:assert/strict";
import { environment } from "./fixture.js";
import { lowerProgram } from "../index.js";
import { emitKernel, emitHelpers, instantiate } from "../../emit/js/index.js";
import { printKernel } from "../../ir/print.js";

const slot = (/** @type {string} */ id, /** @type {string} */ kind, /** @type {string} */ on = "Mole", /** @type {string | undefined} */ key = undefined) => ({ id, kind, on, key });
const frame = (/** @type {string} */ src, on = "Mole") => ({ src, slot: slot(`${on}.onFrame#0`, "onFrame", on) });
const fn = (/** @type {string} */ name, /** @type {string} */ src) => ({ name, kind: /** @type {const} */ ("fn"), src });
const konst = (/** @type {string} */ name, /** @type {string} */ src) => ({ name, kind: /** @type {const} */ ("const"), src });

/** @param {{ diagnostics: Array<{ code: string, severity: string }> }} r */
const errs = (r) => r.diagnostics.filter((d) => d.severity === "error").map((d) => d.code);

/** Every expression node in statements, depth first. @param {unknown} v @param {Array<Record<string, any>>} out */
function nodes(v, out = []) {
  if (Array.isArray(v)) { for (const x of v) nodes(x, out); return out; }
  if (v && typeof v === "object") {
    const o = /** @type {Record<string, any>} */ (v);
    if (typeof o.k === "string") out.push(o);
    for (const [key, x] of Object.entries(o)) if (key !== "t" && key !== "store") nodes(x, out);
  }
  return out;
}

test("a helper is lowered like a method: signature from its call sites, result from its body", () => {
  const r = lowerProgram(environment, [frame("(self, w) => { self.ttl = mix(self.rise, w.frame) % 9; }")], [fn("mix", "(a, b) => a * 31 + b")]);
  assert.deepEqual(errs(r.results[0]), []);
  assert.deepEqual(errs(r.helpers[0].result), []);
  assert.deepEqual(r.sigs.methods["$.mix"].params, ["f64", "f64"]);
  assert.equal(r.sigs.methods["$.mix"].returns, "f64");
  const k = r.helpers[0].result.kernel;
  assert.ok(k);
  assert.equal(k?.slot, "helper");
  assert.equal(k?.name, "mix");
  assert.deepEqual(k?.params.map((p) => [p.name, p.t]), [["a", "f64"], ["b", "f64"]]);
  const call = nodes(r.results[0].kernel?.body).find((n) => n.k === "helper");
  assert.ok(call, "the call is a helper node");
  assert.equal(call?.name, "mix");
  assert.match(printKernel(/** @type {any} */ (r.results[0].kernel)), /mix\(/);
});

test("a caller's effects include the helper's, and a helper may take the world", () => {
  const r = lowerProgram(environment, [frame("(self, w) => { bump(w, 2); }")], [fn("bump", "(w, n) => { w.score += n; }")]);
  assert.deepEqual(errs(r.results[0]), []);
  assert.ok(r.sigs.methods["$.bump"].effects.includes("write World.score"));
  assert.ok(r.results[0].effects.includes("write World.score"));
  assert.ok(r.results[0].effects.includes("call bump"));
});

test("a helper is checked against the subset, and a caller of one that does not lower fails", () => {
  const r = lowerProgram(environment, [frame("(self, w) => { self.ttl = spin(3); }")], [fn("spin", "(n) => { while (n > 0) n--; return n; }")]);
  assert.deepEqual(errs(r.helpers[0].result), ["S101"]);
  assert.deepEqual(errs(r.results[0]), ["L014"]);
  assert.match(r.results[0].diagnostics[0].message, /spin/);
});

test("call sites that disagree on a parameter's type are one error at the later one", () => {
  const r = lowerProgram(environment, [frame("(self, w) => { self.ttl = twice(self.rise); self.up = twice(\"x\") > 1; }")], [fn("twice", "(n) => n * 2")]);
  assert.deepEqual(errs(r.results[0]), ["L014"]);
});

test("a helper nothing calls cannot have its parameters typed", () => {
  const r = lowerProgram(environment, [frame("(self) => { self.up = true; }")], [fn("lonely", "(n) => n + 1")]);
  assert.deepEqual(errs(r.helpers[0].result), ["L014"]);
});

test("helpers calling helpers settle, whatever the order", () => {
  const r = lowerProgram(environment, [frame("(self, w) => { w.next = outer(self.ttl); }")], [fn("inner", "(n) => n + 1"), fn("outer", "(n) => inner(n) * 2")]);
  assert.deepEqual(errs(r.helpers[0].result), []);
  assert.deepEqual(errs(r.helpers[1].result), []);
  assert.deepEqual(r.sigs.methods["$.inner"].params, ["f64"]);
  assert.deepEqual(r.sigs.methods["$.outer"].calls, ["$.inner"]);
});

test("a helper that calls itself, or through another, cannot be bounded", () => {
  const direct = lowerProgram(environment, [frame("(self, w) => { w.next = fact(5); }")], [fn("fact", "(n) => (n <= 1 ? 1 : n * fact(n - 1))")]);
  assert.deepEqual(errs(direct.helpers[0].result), ["L007"]);
  const mutual = lowerProgram(environment, [frame("(self, w) => { w.next = a(5); }")], [fn("a", "(n) => (n <= 0 ? 0 : b(n - 1))"), fn("b", "(n) => a(n)")]);
  assert.deepEqual(errs(mutual.helpers[0].result), ["L007"]);
  assert.deepEqual(errs(mutual.helpers[1].result), ["L007"]);
});

test("a helper with effects may not be called where the slot forbids them", () => {
  const r = lowerProgram(environment, [{ src: "(self, w) => { bump(w); return null; }", slot: slot("Mole.draw#0", "draw") }], [fn("bump", "(w) => { w.score += 1; }")]);
  assert.deepEqual(errs(r.results[0]), ["L004"]);
});

test("a call with the wrong number of arguments is L015", () => {
  const r = lowerProgram(environment, [frame("(self) => { self.ttl = add(1, 2); self.rise = add(1); }")], [fn("add", "(a, b) => a + b")]);
  assert.deepEqual(errs(r.results[0]), ["L015"]);
});

test("a parameter or local that shares a helper's name is that, not the helper", () => {
  const r = lowerProgram(environment, [frame("(self) => { const mix = 3; self.ttl = mix; }"), frame("(self) => { self.ttl = mix(1); }")], [fn("mix", "(a) => a")]);
  assert.deepEqual(errs(r.results[0]), []);
  assert.deepEqual(errs(r.results[1]), []);
});

test("a helper named without a call is L003", () => {
  const r = lowerProgram(environment, [frame("(self) => { const f = mix; self.ttl = 1; }")], [fn("mix", "(a) => a")]);
  assert.deepEqual(errs(r.results[0]), ["L003"]);
});

test("a top-level constant is baked in: it bounds a loop and is read-only", () => {
  const r = lowerProgram(environment, [frame("(self, w) => { for (let i = 0; i < N; i++) w.score += i * STEP; }")], [konst("N", "5"), konst("STEP", "N * 2")]);
  assert.deepEqual(errs(r.results[0]), []);
  const k = r.results[0].kernel;
  const loop = k?.body.find((s) => s.k === "for");
  assert.equal(loop?.k === "for" ? loop.bound : "", "const 5");
  const found = nodes(k?.body);
  assert.ok(!found.some((n) => n.k === "global" || (n.k === "local" && (n.name === "N" || n.name === "STEP"))), "no reference to the constant remains");
  for (const n of found) assert.ok(n.span[0] >= 0 && n.span[1] <= /** @type {string} */ (k?.src).length, "spans stay inside the lambda");
  const w = lowerProgram(environment, [frame("(self) => { N = 3; }")], [konst("N", "5")]);
  assert.deepEqual(errs(w.results[0]), ["L013"]);
});

test("a string constant keeps its literal type; a key that must be written out cannot be one", () => {
  const r = lowerProgram(environment, [frame("(self) => { self.up = NAME === \"pop\"; }")], [konst("NAME", "\"pop\"")]);
  assert.deepEqual(errs(r.results[0]), []);
  const key = lowerProgram(environment, [{ src: "(w) => { w.sfx(NAME); }", slot: slot("timer", "timer", "World") }], [konst("NAME", "\"pop\"")]);
  assert.deepEqual(errs(key.results[0]), ["L011"]);
});

test("a constant that reads the game, or is not an expression of constants, does not lower", () => {
  const r = lowerProgram(environment, [frame("(self) => { self.ttl = RAND; }")], [konst("RAND", "self.rise")]);
  assert.ok(errs(r.helpers[0].result).length > 0);
  assert.deepEqual(errs(r.results[0]), ["L014"]);
});

test("a helper that fails is not silently dropped: only callers fail", () => {
  const r = lowerProgram(environment, [frame("(self) => { self.ttl = 1; }")], [fn("broken", "() => nothing")]);
  assert.deepEqual(errs(r.results[0]), []);
  assert.deepEqual(errs(r.helpers[0].result), ["L001"]);
});

test("emitted helpers run, and a caller sees them through its scope", () => {
  const r = lowerProgram(environment, [frame("(self, w) => { self.ttl = outer(self.rise) + N; }")], [fn("inner", "(n) => n + 1"), fn("outer", "(n) => inner(n) * 2"), konst("N", "7")]);
  assert.deepEqual(errs(r.results[0]), []);
  const scope = emitHelpers(r.helpers.filter((h) => h.kind === "fn").map((h) => emitKernel(/** @type {any} */ (h.result.kernel))));
  assert.deepEqual(Object.keys(scope).sort(), ["inner", "outer"]);
  const caller = instantiate(emitKernel(/** @type {any} */ (r.results[0].kernel)), scope);
  const self = { rise: 4, ttl: 0 };
  caller(self, {});
  assert.equal(self.ttl, (4 + 1) * 2 + 7);
});
