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
