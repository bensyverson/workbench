// A method or helper has one type per parameter: the strict join of every call site's
// argument type, by a closed list. Anything else is one error at the later call site.
import { test } from "node:test";
import assert from "node:assert/strict";
import { environment } from "./fixture.js";
import { lowerProgram } from "../index.js";

/** @import { Type } from "../../ir/ir.js" */

/** A Mole frame lambda; the helper under test is `f`. */
const frame = (/** @type {string} */ src, /** @type {number} */ n = 0) => ({ src, slot: { id: `Mole.onFrame#${n}`, kind: "onFrame", on: "Mole" } });
const fn = (/** @type {string} */ name, /** @type {string} */ src) => ({ name, kind: /** @type {const} */ ("fn"), src });
const F = fn("f", "(x) => 1");

/**
 * Two lambdas, each calling `f` with one argument, and what the program inferred.
 * @param {string} a
 * @param {string} b
 * @param {ReturnType<typeof fn>} [helper]
 */
function sites(a, b, helper = F) {
  const r = lowerProgram(environment, [frame(`(self, w) => {\n  self.ttl = f(${a});\n}`, 0), frame(`(self, w) => {\n  self.ttl = f(${b});\n}`, 1)], [helper]);
  const errors = r.results.flatMap((x, i) => x.diagnostics.filter((d) => d.severity === "error").map((d) => ({ at: i, code: d.code, message: d.message })));
  return { r, errors, param: /** @type {Type} */ (r.sigs.methods["$.f"].params[0]) };
}

/**
 * Both call orders must agree.
 * @param {string} a
 * @param {string} b
 * @param {Type} want
 * @param {ReturnType<typeof fn>} [helper]
 */
function joins(a, b, want, helper = F) {
  for (const [x, y] of [[a, b], [b, a]]) {
    const s = sites(x, y, helper);
    assert.deepEqual(s.errors, [], `${x} then ${y}`);
    assert.deepEqual(s.param, want, `${x} then ${y}`);
  }
}

test("call sites with the same type give that type, in either order", () => {
  joins("self.ttl", "w.score", "f64");
  joins("self", "self", { ref: "Mole" });
});

test("two string literals give their enum, in either order", () => {
  joins('"a"', '"b"', { enum: ["a", "b"] }, fn("f", "(x) => 1"));
  joins('"a"', '"a"', { enum: ["a"] });
});

test("a value and null give possibly empty, in either order", () => {
  joins("self", "null", { opt: { ref: "Mole" } }, fn("f", "(m) => (m ? 1 : 0)"));
  joins("self.ttl", "null", { opt: "f64" });
});

test("a possibly-empty argument and a plain one give possibly empty", () => {
  joins("self", "w.rng.pick(w.board)", { opt: { ref: "Mole" } }, fn("f", "(m) => (m ? 1 : 0)"));
});

test("a string literal and plain str give str, in either order", () => {
  joins('"a"', '"a" + w.score', "str");
});

test("a mismatch is one L014 at the second call site, naming both sites and both types", () => {
  const s = sites("self.ttl", "self");
  assert.deepEqual(s.errors.map((e) => [e.at, e.code]), [[1, "L014"]]);
  const m = s.errors[0].message;
  assert.match(m, /`f` takes f64 at Mole\.onFrame#0 line 2 and Mole at Mole\.onFrame#1 line 2; one parameter has one type\./);
  assert.deepEqual(s.param, "f64", "the first site's type stands");
});

test("swapping the call order gives the mirrored error, still one, at the other lambda", () => {
  const s = sites("self", "self.ttl");
  assert.deepEqual(s.errors.map((e) => [e.at, e.code]), [[1, "L014"]]);
  assert.match(s.errors[0].message, /`f` takes Mole at Mole\.onFrame#0 line 2 and f64 at Mole\.onFrame#1 line 2/);
});

test("the error names the line within a lambda, and the earlier site that conflicts", () => {
  const r = lowerProgram(environment, [
    frame("(self, w) => {\n  self.ttl = f(1);\n}", 0),
    frame("(self, w) => {\n  self.ttl = f(2);\n}", 1),
    frame("(self, w) => {\n\n\n  self.ttl = f(self);\n}", 2),
  ], [F]);
  const errs = r.results.flatMap((x) => x.diagnostics.filter((d) => d.severity === "error"));
  assert.equal(errs.length, 1);
  assert.match(errs[0].message, /f64 at Mole\.onFrame#0 line 2 and Mole at Mole\.onFrame#2 line 4/);
  assert.equal(errs[0].loc.start.line, 4);
});

test("a str and a number, and a literal and a number, do not join", () => {
  assert.deepEqual(sites('"a"', "1").errors.map((e) => e.code), ["L014"]);
  assert.deepEqual(sites('"a" + w.score', "1").errors.map((e) => e.code), ["L014"]);
});

test("different dialect types are nominal and never join", () => {
  const s = sites("w", "w.input");
  assert.deepEqual(s.errors.map((e) => e.code), ["L014"]);
  assert.match(s.errors[0].message, /World|the world|Input/);
  assert.deepEqual(sites("w", "w").errors, []);
});

test("different entity kinds never join, even with the same shape", () => {
  const r = lowerProgram(environment, [
    frame("(self, w) => { self.ttl = f(self); }", 0),
    { src: "(self, w) => { self.cell = f(self); }", slot: { id: "Hammer.onFrame#0", kind: "onFrame", on: "Hammer" } },
  ], [F]);
  const errs = r.results.flatMap((x) => x.diagnostics.filter((d) => d.severity === "error"));
  assert.deepEqual(errs.map((e) => e.code), ["L014"]);
  assert.match(errs[0].message, /Mole .* Hammer/);
});

test("structs join only when identical", () => {
  joins("{ a: 1 }", "{ a: 2 }", { struct: { a: "f64" } });
  assert.deepEqual(sites("{ a: 1 }", "{ a: 1, b: 2 }").errors.map((e) => e.code), ["L014"]);
  assert.deepEqual(sites("{ a: 1 }", "{ a: \"x\" }").errors.map((e) => e.code), ["L014"]);
});

test("a method's parameters are joined the same way", () => {
  const method = { src: "(self, n) => { self.ttl = 1; }", slot: { id: "Mole.method(pop)", kind: "method", on: "Mole", key: "pop" } };
  const ok = lowerProgram(environment, [method, frame("(self) => { self.pop(1); }", 0), frame("(self) => { self.pop(self.rise); }", 1)]);
  assert.deepEqual(ok.results.flatMap((x) => x.diagnostics), []);
  assert.deepEqual(ok.sigs.methods["Mole.pop"].params, ["f64"]);
  const bad = lowerProgram(environment, [method, frame("(self) => { self.pop(1); }", 0), frame("(self) => { self.pop(\"x\"); }", 1)]);
  const errs = bad.results.flatMap((x) => x.diagnostics.filter((d) => d.severity === "error"));
  assert.deepEqual(errs.map((e) => e.code), ["L014"]);
  assert.match(errs[0].message, /`Mole\.pop` takes f64 at Mole\.onFrame#0 line 1 and str "x" at Mole\.onFrame#1 line 1; one parameter has one type\./);
});

test("each parameter is joined on its own", () => {
  const r = lowerProgram(environment, [
    frame("(self) => { self.ttl = g(1, \"a\"); }", 0),
    frame("(self) => { self.ttl = g(2, \"b\"); }", 1),
  ], [fn("g", "(n, s) => n")]);
  assert.deepEqual(r.results.flatMap((x) => x.diagnostics), []);
  assert.deepEqual(r.sigs.methods["$.g"].params, ["f64", { enum: ["a", "b"] }]);
});

test("the joined type is what the helper's body sees", () => {
  const r = lowerProgram(environment, [frame("(self) => { self.ttl = f(\"a\"); }", 0), frame("(self) => { self.ttl = f(\"b\"); }", 1)], [fn("f", "(x) => (x === \"a\" ? 1 : 2)")]);
  assert.deepEqual(r.helpers[0].result.diagnostics, []);
  assert.deepEqual(r.helpers[0].result.kernel?.params[0].t, { enum: ["a", "b"] });
});

test("literals of different lengths do not join, and equal lengths do, keeping their length", () => {
  assert.deepEqual(sites("[1, 2]", "[1, 2, 3]").errors.map((e) => e.code), ["L014"]);
  assert.deepEqual(sites("[1, 2]", "w.board").errors.map((e) => e.code), ["L014"]);
  joins("[1, 2]", "[3, 4]", { list: "f64", max: 2, len: 2 });
});

/** @param {ReturnType<typeof lowerProgram>} r */
const lambdaErrors = (r) => r.results.map((x) => x.diagnostics.filter((d) => d.severity === "error").map((d) => `${d.code} ${d.message}`));
/** @param {ReturnType<typeof lowerProgram>} r */
const helperErrors = (r) => Object.fromEntries(r.helpers.map((h) => [h.name, h.result.diagnostics.filter((d) => d.severity === "error").map((d) => d.code)]));

test("arity comes from the declaration, not from whichever call site is first: each wrong call is its own L015", () => {
  const f = fn("f", "(x) => x");
  const wrongFirst = lowerProgram(environment, [frame("(self) => { self.ttl = f(1, 2); }", 0), frame("(self) => { self.ttl = f(1); }", 1), frame("(self) => { self.ttl = f(3); }", 2)], [f]);
  assert.deepEqual(lambdaErrors(wrongFirst).map((e) => e.map((m) => m.slice(0, 4))), [["L015"], [], []]);
  assert.deepEqual(wrongFirst.sigs.methods["$.f"].params, ["f64"], "the wrong call joins nothing");
  const wrongLast = lowerProgram(environment, [frame("(self) => { self.ttl = f(1); }", 0), frame("(self) => { self.ttl = f(1, 2); }", 1), frame("(self) => { self.ttl = f(); }", 2)], [f]);
  assert.deepEqual(lambdaErrors(wrongLast).map((e) => e.map((m) => m.slice(0, 4))), [[], ["L015"], ["L015"]]);
  assert.match(lambdaErrors(wrongLast)[1][0], /f got 2 arguments/);
  assert.deepEqual(helperErrors(wrongFirst), { f: [] });
});

test("a method's arity comes from its declaration too", () => {
  const method = { src: "(self, n) => { self.ttl = n; }", slot: { id: "Mole.method(pop)", kind: "method", on: "Mole", key: "pop" } };
  const r = lowerProgram(environment, [method, frame("(self) => { self.pop(1, 2); }", 0), frame("(self) => { self.pop(1); }", 1)]);
  assert.deepEqual(lambdaErrors(r).map((e) => e.map((m) => m.slice(0, 4))), [[], ["L015"], []]);
  assert.deepEqual(r.sigs.methods["Mole.pop"].params, ["f64"]);
});

test("a helper whose every call has the wrong number of arguments is reported at the calls", () => {
  const r = lowerProgram(environment, [frame("(self) => { self.ttl = f(1, 2); }", 0)], [fn("f", "(x) => x")]);
  assert.deepEqual(lambdaErrors(r)[0].map((m) => m.slice(0, 4)), ["L015"]);
});

test("a lambda shared by two kinds is one site per kind: one error, at the second, naming two different sites", () => {
  const src = "(self, w) => { w.score = f(self); }";
  const r = lowerProgram(environment, [
    { src, slot: { id: "shared.onFrame#0", kind: "onFrame", on: "Mole" } },
    { src, slot: { id: "shared.onFrame#0", kind: "onFrame", on: "Hammer" } },
  ], [fn("f", "(o) => 1")]);
  const errs = lambdaErrors(r);
  assert.deepEqual(errs[0], [], "the first site (Mole) is not in conflict");
  assert.equal(errs[1].length, 1);
  assert.match(errs[1][0], /takes Mole at shared\.onFrame#0 on Mole line 1 and Hammer at shared\.onFrame#0 on Hammer line 1;/);
});

test("a dialect enum meets a literal by membership: a member joins, a non-member is an L014 in either order", () => {
  const order = { enum: ["random", "sweep"], declared: true };
  const dialect = frame("(self, w) => { self.ttl = f(w.param(\"order\")); }", 0);
  const member = frame("(self) => { self.ttl = f(\"sweep\"); }", 1);
  const other = frame("(self) => { self.ttl = f(\"diagonal\"); }", 1);
  const ok = lowerProgram(environment, [dialect, member], [F]);
  assert.deepEqual(lambdaErrors(ok).flat(), []);
  assert.deepEqual(ok.sigs.methods["$.f"].params, [order]);
  const swapped = lowerProgram(environment, [member, dialect], [F]);
  assert.deepEqual(lambdaErrors(swapped).flat(), []);
  assert.deepEqual(swapped.sigs.methods["$.f"].params, [order]);
  for (const lambdas of [[dialect, other], [other, dialect]]) {
    const r = lowerProgram(environment, lambdas, [F]);
    const errs = lambdaErrors(r);
    assert.equal(errs.flat().length, 1, "one error");
    assert.match(errs[1][0], /^L014 /, "at the second site");
  }
});

test("two different dialect enums are nominal and do not join", () => {
  const r = lowerProgram(environment, [frame("(self, w) => { self.ttl = f(w.param(\"order\")); }", 0), frame("(self) => { self.ttl = f(self.kind); }", 1)], [F]);
  assert.deepEqual(lambdaErrors(r)[0], []);
  assert.match(lambdaErrors(r)[1][0], /^L014 /);
});

test("null and a void call do not join: one L014 at the second site, naming both", () => {
  const helpers = [F, fn("g", "() => { }")];
  const r = lowerProgram(environment, [frame("(self) => { self.ttl = f(null); }", 0), frame("(self) => { self.ttl = f(g()); }", 1)], helpers);
  const errs = lambdaErrors(r);
  assert.deepEqual(errs[0], [], "the first site is not the one in conflict");
  assert.equal(errs[1].length, 1);
  assert.match(errs[1][0], /^L014 `f` takes null at Mole\.onFrame#0 line 1 and void at Mole\.onFrame#1 line 1/);
});

test("only call sites in code a runtime lambda reaches count: an unreached helper's call decides nothing", () => {
  const f = fn("f", "(x) => 1"), h1 = fn("h1", "() => f(1)"), h2 = fn("h2", "() => f(\"s\")");
  for (const helpers of [[f, h1, h2], [f, h2, h1], [h2, h1, f]]) {
    const r = lowerProgram(environment, [frame("(self) => { self.ttl = h2(); }")], helpers);
    assert.deepEqual(lambdaErrors(r)[0], [], helpers.map((h) => h.name).join());
    assert.deepEqual(r.sigs.methods["$.f"].params, [{ enum: ["s"] }], "only h2's call counts");
    assert.deepEqual(helperErrors(r).h2, [], "h2 itself lowers");
  }
});

test("a call site reached through a helper counts, however deep", () => {
  const r = lowerProgram(environment, [frame("(self) => { self.ttl = outer(); }")], [fn("f", "(x) => 1"), fn("inner", "() => f(2)"), fn("outer", "() => inner()")]);
  assert.deepEqual(lambdaErrors(r)[0], []);
  assert.deepEqual(r.sigs.methods["$.f"].params, ["f64"]);
});

test("literals nested in a struct or list do not join: still one L014, naming the differing field or item and the fix", () => {
  for (const [a, b, where, vs] of /** @type {const} */ ([
    ['{ d: "up" }', '{ d: "down" }', "field `d`", '"up" vs "down"'],
    ['{ x: 1, p: { d: "up" } }', '{ x: 2, p: { d: "down" } }', "field `p.d`", '"up" vs "down"'],
    ['["a"]', '["b"]', "the items", '"a" vs "b"'],
    ['[{ d: "a" }]', '[{ d: "b" }]', "the items, field `d`", '"a" vs "b"'],
  ])) {
    const s = sites(a, b, fn("f", "(o) => 1"));
    assert.deepEqual(s.errors.map((e) => [e.at, e.code]), [[1, "L014"]], `${a} / ${b}`);
    const d = s.r.results[1].diagnostics.find((x) => x.code === "L014");
    assert.ok(d?.message.includes(where) && d.message.includes(vs), String(d?.message));
    assert.match(d?.tip ?? "", /own parameter/, "the tip says to pass it as its own parameter");
  }
  const plain = sites("self.ttl", "self").r.results[1].diagnostics.find((x) => x.code === "L014");
  assert.match(plain?.tip ?? "", /^Pass f the same type at every call, or split it into two functions\.$/, "other mismatches keep the general wording");
});
