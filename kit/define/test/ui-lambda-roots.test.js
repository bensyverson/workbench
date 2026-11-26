// @ts-nocheck: the UI's lambdas are source text, never called, and name the Dialect's free names.
// U007 is structural (leaf kQu7xe, Ben's ruling 2026-11-25): every member chain in a UI lambda starts at a parameter or a
// Dialect global, and a local never holds anything read from a parameter, so defineUI is sound without lower().
// Ported from reviewer-ui-1's probe (local/rev-ui1/lambda.probe.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { defineDialect, defineGrammar, defineUI, exact, vector, enumOf, opt, struct, list, name, DefinitionError } from "../index.js";

const dialect = defineDialect({
  name: "orbits", numberType: "f64", conditions: "bool",
  types: { vec2: vector(2, "f64", { aliases: { u: "x", v: "y" } }) },
  spaces: { s: { pure: true } },
  objects: {
    Params: { label: "the params", members: { mass: "f64" } },
    Math: { label: "Math", members: { abs: { fn: { params: ["f64"], returns: "f64" } }, max: { fn: { params: ["f64", "f64"], returns: "f64" } } } },
  },
  globals: { $: "Params", Math: "Math" },
  targets: { js: { accepts: "*", compare: exact() } },
  slots: { v: { params: [], returns: "f64", space: "s" } },
  params: { object: "Params", name: "$" },
  state: {
    t: "f64", alive: "bool", label: "str", mode: enumOf(["a", "b"]), center: "vec2", best: opt("f64"),
    bounds: struct({ width: "f64", height: "f64" }),
    player: opt(struct({ x: "f64" })),
    bodies: list(struct({ name: "str", speed: "f64" }), 50),
  },
  text: (s) => String(s.t),
});
const orbits = defineGrammar(dialect, { root: "p", constructs: { p: { opens: [name()], slots: {} } } });
const codes = (fn) => {
  try { defineUI(orbits, { tiles: { t: { title: "T", place: { splitBelow: "stage" }, body: [{ kind: "check", label: "x", expect: fn }] } } }); return []; } catch (e) {
    assert.ok(e instanceof DefinitionError, String(e));
    return e.diagnostics.map((d) => d.code);
  }
};
const message = (fn) => {
  try { defineUI(orbits, { tiles: { t: { title: "T", place: { splitBelow: "stage" }, body: [{ kind: "check", label: "x", expect: fn }] } } }); return ""; } catch (e) { return e.diagnostics.map((d) => `${d.message} | ${d.tip}`).join("\n"); }
};

test("a declared read passes, an undeclared one fails", () => {
  assert.deepEqual(codes((s) => s.t > 0), []);
  assert.deepEqual(codes((s) => s.bogus > 0), ["U007"]);
  assert.deepEqual(codes((s) => s.bounds.width > 0 && s.bodies[0].speed > 0 && s.player.x > 0 && s.center.u > 0), []);
});

test("an alias of a struct member or a list item is refused, whatever it then reads", () => {
  assert.deepEqual(codes((s) => { const b = s.bounds; return b.bogus > 0; }), ["U007"]);
  assert.deepEqual(codes((s) => { const b = s.bodies[0]; return b.bogus > 0; }), ["U007"]);
  assert.deepEqual(codes((s) => { const b = s.bounds; return b.width > 0; }), ["U007"], "a valid read through an alias is refused too: no state in a local");
  assert.match(message((s) => { const b = s.bounds; return b.width > 0; }), /may not hold state in a local/);
  assert.match(message((s) => { const b = s.bounds; return b.width > 0; }), /read s\.member where you use it/);
});

test("a local destructuring of state is refused", () => {
  assert.deepEqual(codes((s) => { const { bogus } = s.bounds; return bogus > 0; }), ["U007"]);
  assert.deepEqual(codes((s) => { const { width } = s.bounds; return width > 0; }), ["U007"]);
  assert.deepEqual(codes((s, $) => { const { mass } = $; return mass > 0; }), ["U007"]);
});

test("a let set from state, at its declaration or by assignment, is refused", () => {
  assert.deepEqual(codes((s) => { let b = s.bounds; b = s.bounds; return b.bogus > 0; }), ["U007"], "said once at the declaration: the later assignment and the read off b are not said again");
  assert.deepEqual(codes((s) => { let n = 0; n = s.t; return n > 0; }), ["U007"]);
  assert.deepEqual(codes((s) => { let n = 0; n += s.t; return n > 0; }), ["U007"]);
});

test("a member chain rooted at an expression is refused: conditional, logical, call, array", () => {
  assert.deepEqual(codes((s) => (s.t > 0 ? s.bounds : s.bounds).bogus > 0), ["U007"]);
  assert.deepEqual(codes((s) => (s.bounds || s.bounds).bogus > 0), ["U007"]);
  assert.deepEqual(codes((s) => Math.abs(s.t).bogus > 0), ["U007"]);
  assert.deepEqual(codes((s) => [s.bounds][0].bogus > 0), ["U007"]);
  assert.deepEqual(codes((s) => (s.t > 0 ? s.bounds : s.bounds).width > 0), ["U007"], "a valid read off an expression root is refused too");
  assert.match(message((s) => (s.t > 0 ? s.bounds : s.bounds).width > 0), /starts at|root|parameter/);
});

test("a chain rooted at a local is refused, a local that shadows a global included", () => {
  assert.deepEqual(codes((s) => { const Math = s.bounds; return Math.bogus > 0; }), ["U007"]);
  assert.deepEqual(codes((s) => { const k = 2; return k.bogus > 0; }), ["U007"]);
});

test("a destructured parameter is refused, used or not, with an undeclared key or a declared one", () => {
  assert.deepEqual(codes(({ bogus }) => true), ["U007"]);
  assert.deepEqual(codes(({ t }) => t > 0), ["U007"]);
});

test("locals holding plain values, computed without reading a parameter, stay legal", () => {
  assert.deepEqual(codes((s) => { const k = 2; return s.t > k; }), []);
  assert.deepEqual(codes((s) => { let i = 0; i++; return i > 0; }), []);
  assert.deepEqual(codes((s) => { const k = Math.max(1, 2); return s.t > k; }), []);
});

test("reads of globals and the other refusals still hold", () => {
  assert.deepEqual(codes((s, $) => $.mass > 0 && Math.abs(s.t) > 0), []);
  assert.deepEqual(codes((s) => Math.bogus(1) > 0), ["U007"]);
  assert.deepEqual(codes((s) => { const b = s.bounds; b.width = 1; return true; }).every((c) => c === "U007"), true);
  assert.deepEqual(codes((s) => s.t += 1), ["U007"]);
  assert.deepEqual(codes((s) => s.bodies.push(1) > 0), ["U007"]);
  assert.deepEqual(codes((s) => s.player.bogus > 0), ["U007"]);
  assert.deepEqual(codes((s) => s.center.w > 0), ["U007"]);
});

test("a for-of binding over state is a local holding state, so it is refused; a counted loop that reads no item is not", () => {
  assert.deepEqual(codes((s) => { let n = 0; for (const b of s.bodies) n += 1; return n > 0; }), ["U007"]);
  assert.deepEqual(codes((s) => { let n = 0; for (const b of s.bodies) n += b.speed; return n > 0; }), ["U007"]);
  assert.deepEqual(codes((s) => { let n = 0; for (let i = 0; i < s.bodies.length; i++) n += 1; return n > 0; }), []);
});
