// Conditions are boolean only, in every Environment: a non-bool if, ternary or loop test, or a non-bool operand of
// `!`, `&&` or `||` in a test, is L003, and the tip writes the explicit form for the type found.
import { test } from "node:test";
import assert from "node:assert/strict";
import { lowerLambda } from "../index.js";

/** @import { Environment } from "../environment.js" */

/** @type {Environment} */
const environment = {
  name: "bool conditions (test)",
  objects: { E: { label: "e", members: {} } },
  list: {},
  queries: [],
  globals: {},
  // (n: f64, m: f64?, s: str, e: E?, b: bool)
  slot: () => ({ params: ["f64", { opt: "f64" }, "str", { opt: { ref: "E" } }, "bool"], returns: "infer", space: "row", forbid: [] }),
};

const P = "(n, m, s, e, b) =>";

/** @param {string} src */
const lower = (src) => lowerLambda(environment, src, { id: "t.keep", kind: "keep", on: "t" });
/** @param {string} src */
const codes = (src) => lower(src).diagnostics.map((d) => d.code);
/** @param {string} src */
const tips = (src) => lower(src).diagnostics.map((d) => d.tip ?? "").join("\n");

test("a bool still works in every condition position", () => {
  assert.deepEqual(codes(`${P} { if (b && !b || n > 1) return true; return false; }`), []);
  assert.deepEqual(codes(`${P} b ? true : false`), []);
  assert.deepEqual(codes(`${P} { if (e != null) return true; return false; }`), []);
});

test("a number, optional, string or entity as an if, ternary or ! test is one L003", () => {
  assert.deepEqual(codes(`${P} { if (n) return true; return false; }`), ["L003"]);
  assert.deepEqual(codes(`${P} n ? true : false`), ["L003"]);
  assert.deepEqual(codes(`${P} !n`), ["L003"]);
  assert.deepEqual(codes(`${P} { if (m) return true; return false; }`), ["L003"]);
  assert.deepEqual(codes(`${P} { if (s) return true; return false; }`), ["L003"]);
  assert.deepEqual(codes(`${P} { if (e) return true; return false; }`), ["L003"]);
  assert.deepEqual(codes(`${P} { if (!e) return true; return false; }`), ["L003"]);
});

test("a non-bool operand of && or || in a test is L003", () => {
  assert.deepEqual(codes(`${P} { if (b && n) return true; return false; }`), ["L003"]);
  assert.deepEqual(codes(`${P} { if (e || b) return true; return false; }`), ["L003"]);
});

test("the tip writes the explicit form for the type found", () => {
  assert.match(tips(`${P} { if (m) return true; return false; }`), /m == null/);
  assert.match(tips(`${P} { if (e) return true; return false; }`), /e == null/);
  assert.match(tips(`${P} { if (n) return true; return false; }`), /n !== 0/);
  assert.match(tips(`${P} { if (s) return true; return false; }`), /s !== ""/);
});

/** @type {Environment} */
const typed = {
  ...environment,
  name: "condition tips (test)",
  // (l: f64[<=4], st: { a: f64 }, en: "a" | "b", z: null, n: f64, b: bool)
  slot: () => ({ params: [{ list: "f64", max: 4 }, { struct: { a: "f64" } }, { enum: ["a", "b"] }, "null", "f64", "bool"], returns: "infer", space: "row", forbid: [] }),
};
/** @param {string} src */
const typedTip = (src) => lowerLambda(typed, `(l, st, en, z, n, b) => ${src}`, { id: "t.keep", kind: "keep", on: "t" }).diagnostics.map((d) => d.tip ?? "").join("\n");

test("the tip for a list, struct, enum or null is a test that is itself a legal condition", () => {
  assert.match(typedTip("{ if (l) return true; return false; }"), /l\.length !== 0/);
  assert.doesNotMatch(typedTip("{ if (l) return true; return false; }"), /l !== 0/);
  assert.match(typedTip("{ if (st) return true; return false; }"), /st\.a/);
  assert.doesNotMatch(typedTip("{ if (st) return true; return false; }"), /st !== 0/);
  assert.match(typedTip("{ if (en) return true; return false; }"), /en === "<member>"/);
  assert.doesNotMatch(typedTip("{ if (en) return true; return false; }"), /!== ""/);
  assert.doesNotMatch(typedTip("{ if (z) return true; return false; }"), /z !== 0/);
});

test("the tip parenthesizes source text that is not a name or member chain", () => {
  assert.match(typedTip("{ if (b ? n : n) return true; return false; }"), /\(b \? n : n\) !== 0/);
  assert.match(typedTip("{ if (n) return true; return false; }"), /n !== 0/);
  assert.doesNotMatch(typedTip("{ if (n) return true; return false; }"), /\(n\)/);
});

test("L008's tip is a check the kit accepts: x == null, never a truthiness test", () => {
  const r = lowerLambda(environment, "(n, m, s, e, b) => { e.kill(); }", { id: "t.keep", kind: "keep", on: "t" });
  const tip = r.diagnostics.find((d) => d.code === "L008")?.tip ?? "";
  assert.match(tip, /if \(e == null\) return;/);
  assert.doesNotMatch(tip, /if \(!e\)/);
});
