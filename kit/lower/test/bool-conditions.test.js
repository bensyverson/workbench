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
