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

// Changed 2026-11-25 (leaf 8vQJOw): the caller used to add an L014 naming the helper, a second diagnostic for the
// helper's one mistake; now it has no kernel and names the helper in blockedBy, and only the helper reports.
test("a helper is checked against the subset, and a caller of one that does not lower fails without a second diagnostic", () => {
  const r = lowerProgram(environment, [frame("(self, w) => { self.ttl = spin(3); }")], [fn("spin", "(n) => { while (n > 0) n--; return n; }")]);
  assert.deepEqual(errs(r.helpers[0].result), ["S101"]);
  assert.deepEqual(errs(r.results[0]), []);
  assert.equal(r.results[0].ok, false);
  assert.equal(r.results[0].kernel, null);
  assert.deepEqual(r.results[0].blockedBy, ["spin"]);
});

test("call sites that disagree on a parameter's type are one error at the later one", () => {
  const r = lowerProgram(environment, [frame("(self, w) => { self.ttl = twice(self.rise); self.up = twice(\"x\") > 1; }")], [fn("twice", "(n) => n * 2")]);
  assert.deepEqual(errs(r.results[0]), ["L014"]);
});

test("a helper nothing calls cannot have its parameters typed", () => {
  const r = lowerProgram(environment, [frame("(self) => { self.up = true; }")], [fn("lonely", "(n) => n + 1")]);
  assert.deepEqual(errs(r.helpers[0].result), ["L014"]);
});

// Found by leaf gS9dBz: a construct with state lowers one lambda at a time with every helper, so a helper chain
// that lambda does not reach was lowered against an untyped callee's signature, and lowering threw.
test("an unreached helper calling another unreached helper is L014, not a crash", () => {
  const r = lowerProgram(environment, [frame("(self) => { self.up = true; }")], [fn("inner", "(n) => n + 1"), fn("outer", "(n) => inner(1) * n")]);
  assert.deepEqual(errs(r.results[0]), []);
  assert.ok(errs(r.helpers[1].result).includes("L014"));
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
  // one L007 per cycle (review of 8ad7338, L2), not one per helper in it
  assert.deepEqual([...errs(mutual.helpers[0].result), ...errs(mutual.helpers[1].result), ...errs(mutual.results[0])], ["L007"]);
  const three = lowerProgram(environment, [frame("(self, w) => { w.next = a(5); }")], [fn("a", "(n) => (n <= 0 ? 0 : b(n - 1))"), fn("b", "(n) => c(n)"), fn("c", "(n) => a(n)")]);
  assert.deepEqual(three.helpers.flatMap((h) => errs(h.result)), ["L007"]);
});

test("a helper that returns a value on some path has no bare return (one L003, at the bare return)", () => {
  const both = (/** @type {string} */ src) => lowerProgram(environment, [frame("(self, w) => { w.next = h(self.ttl); }")], [fn("h", src)]);
  const mixed = both("(a) => { if (a > 1) { return 1; } return; }");
  const d = mixed.helpers[0].result.diagnostics.filter((x) => x.code === "L003");
  assert.equal(d.length, 1);
  assert.match(d[0].message, /bare return gives none/);
  assert.deepEqual(errs(mixed.results[0]), [], "callers add nothing");
  assert.equal(mixed.sigs.methods["$.h"].returns, "f64", "the type omits void");
  // a bare return and a fall-through is still one diagnostic
  const open = both("(a) => { if (a > 1) { return 1; } else if (a > 0) { return; } }");
  assert.deepEqual(errs(open.helpers[0].result), ["L003"]);
  assert.deepEqual(errs(open.results[0]), []);
  // a bare return first, the value later
  assert.deepEqual(errs(both("(a) => { if (a > 1) { return; } return 1; }").helpers[0].result), ["L003"]);
  // still fine: only bare returns, or only values
  assert.deepEqual(errs(lowerProgram(environment, [frame("(self, w) => { h(self.ttl); }")], [fn("h", "(a) => { if (a > 1) { return; } }")]).helpers[0].result), []);
  assert.deepEqual(errs(both("(a) => { if (a > 1) { return 1; } return 2; }").helpers[0].result), []);
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

/** @param {ReturnType<typeof lowerProgram>} r */
const lambdaErrors = (r) => r.results.map((x) => x.diagnostics.filter((d) => d.severity === "error").map((d) => d.code));

test("a pure helper may be called inside a query callback; one with an effect may not", () => {
  const pure = lowerProgram(environment, [frame("(self, w) => { const m = w.board.find((e) => f(e.ttl) > 2); if (!m) return; self.ttl = 1; }")], [fn("f", "(x) => x * 2")]);
  assert.deepEqual(lambdaErrors(pure)[0], []);
  const impure = lowerProgram(environment, [frame("(self, w) => { const m = w.board.find((e) => f(e) > 2); if (!m) return; self.ttl = 1; }")], [fn("f", "(o) => { o.ttl = 1; return 1; }")]);
  assert.deepEqual(lambdaErrors(impure)[0], ["L006"]);
  const unknown = lowerProgram(environment, [frame("(self, w) => { const m = w.board.find((e) => f(e.ttl) > 2); if (!m) return; self.ttl = 1; }")], [fn("f", "(x) => nope")]);
  // Changed 2026-11-25 (leaf 8vQJOw): was L014 at the caller; the helper's own L001 is the one diagnostic now.
  assert.deepEqual(lambdaErrors(unknown)[0], [], "the helper reports its own mistake");
  assert.equal(unknown.results[0].kernel, null, "a caller of a helper that does not lower has no kernel");
});

test("a list or struct value has no identity: === and !== on one are L003, baked or not", () => {
  for (const [c, src] of /** @type {const} */ ([
    [konst("D", "[1, 2]"), "(self) => { self.up = D === D; }"],
    [konst("D", "{ x: 1 }"), "(self) => { self.up = D === D; }"],
    [konst("D", "[1, 2]"), "(self) => { self.up = D !== D; }"],
    [konst("D", "[1, 2]"), "(self) => { self.up = D === [1, 2]; }"],
    [konst("D", "{ x: 1 }"), "(self) => { self.up = { x: 1 } === D; }"],
    [konst("D", "1"), "(self, w) => { self.up = w.board === w.board; }"],
  ])) {
    const r = lowerProgram(environment, [frame(src)], [c]);
    assert.deepEqual(lambdaErrors(r)[0], ["L003"], src);
    assert.match(r.results[0].diagnostics[0].tip, /fields/, "the tip says what to compare");
  }
});

test("a baked list or struct constant's items and fields still compare", () => {
  const r = lowerProgram(environment, [frame("(self) => { self.up = D[0] === 1 && E.x === 1 && D.length === 2; }")], [konst("D", "[1, 2]"), konst("E", "{ x: 1 }")]);
  assert.deepEqual(lambdaErrors(r)[0], []);
  const s = { up: false };
  instantiate(emitKernel(/** @type {import("../../ir/ir.js").Kernel} */ (r.results[0].kernel)))(s, {});
  assert.equal(s.up, true);
});
