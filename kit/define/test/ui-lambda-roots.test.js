// @ts-nocheck: the UI's lambdas are source text, never called, and name the Dialect's free names.
// U007 is structural (leaf kQu7xe, Ben's ruling 2026-11-25; relaxed by leaf 3kCvsI): every member chain in a UI lambda starts at
// a parameter, a const set to exactly a parameter chain, or a Dialect global, so defineUI is sound without lower().
// Ported from reviewer-ui-1's probe (local/rev-ui1/lambda.probe.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { defineDialect, defineGrammar, defineUI, exact, vector, enumOf, opt, struct, list, name, DefinitionError } from "../index.js";

const dialectSrc = () => ({
  name: "orbits", numberType: "f64",
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
const dialect = defineDialect(dialectSrc());
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

test("a const set to exactly a parameter chain is typed by it; a let or any other source holding state is refused", () => {
  // Changed by leaf 3kCvsI (Ben, 2026-11-25): these were all refused ("no state in a local"); a const chain now takes its Type.
  assert.deepEqual(codes((s) => { const b = s.bounds; return b.width > 0; }), [], "a valid read through a const chain is legal");
  assert.deepEqual(codes((s) => { const b = s.bounds; return b.bogus > 0; }), ["U007"], "an undeclared member through it is U007");
  assert.deepEqual(codes((s) => { const b = s.bodies[0]; return b.bogus > 0; }), ["U007"]);
  assert.match(message((s) => { const b = s.bodies[0]; return b.spedd > 0; }), /Did you mean 'speed'\?/);
  assert.deepEqual(codes((s) => { const b = s.bodies[0]; const p = b.speed; return p > 0; }), [], "a const of a const chains");
  assert.deepEqual(codes((s) => { const p = s.player; return p != null ? p.x : 0; }), []);
  assert.deepEqual(codes((s) => { const p = s.player; return p.bogus; }), ["U007"]);
  assert.deepEqual(codes((s) => { const c = s.center; return c.u + c.y; }), [], "a vector's alias");
  assert.deepEqual(codes((s) => { const c = s.center; return c.z; }), ["U007"]);
  assert.deepEqual(codes((s) => { const w = s.t; return w.x; }), ["U007"], "a number has no members");
  assert.ok(codes((s) => { const t = s; return t.t > 0; }).length > 0, "the state is never held whole");
  assert.deepEqual(codes((s) => { let b = s.bounds; return b.width > 0; }), ["U007"], "a let does not hold a struct");
  assert.deepEqual(codes((s) => { const b = s.t > 0 ? s.bounds : s.bounds; return b.width > 0; }), ["U007"], "a conditional of structs");
  assert.deepEqual(codes((s) => { const b = s.bounds || s.bounds; return b.width > 0; }), ["U007"], "a logical of structs");
  assert.match(message((s) => { const b = s.t > 0 ? s.bounds : s.bounds; return b.width > 0; }), /may not hold state in a local/);
  assert.match(message((s) => { let b = s.bounds; return b.width > 0; }), /read s\.member where you use it/);
});

test("shadowing: an inner const or a nested arrow's parameter hides an outer typed const", () => {
  assert.deepEqual(codes((s) => { const b = s.bounds; { const b = 2; return b.bogus > 0; } }), ["U007"], "the inner b is a plain local");
  assert.deepEqual(codes((s) => { const b = 3; { const b = s.bounds; return b.width > 0; } }), [], "an inner typed const over a plain outer");
  assert.deepEqual(codes((s) => { const b = s.bounds; { const b = s.bodies[0]; return b.width > 0; } }), ["U007"], "the inner b has the inner Type");
  assert.deepEqual(codes((s) => { const b = s.bounds; const f = (b) => b.width; return f(2) > 0; }), ["U007"], "an arrow's own parameter is no state");
  assert.deepEqual(codes((s) => { const b = s.bounds; { const k = 1; } return b.width > 0; }), [], "a block's names end with it");
});

test("a destructuring of state is still refused", () => {
  assert.deepEqual(codes((s) => { const { bogus } = s.bounds; return bogus > 0; }), ["U007"]);
  assert.deepEqual(codes((s) => { const { width } = s.bounds; return width > 0; }), ["U007"]);
  assert.deepEqual(codes((s, $) => { const { mass } = $; return mass > 0; }), ["U007"]);
});

test("a let holding a scalar computed from state is legal; one holding a struct, list or optional is not", () => {
  assert.deepEqual(codes((s) => { let n = 0; n = s.t; return n > 0; }), []);
  assert.deepEqual(codes((s) => { let n = 0; n += s.t; return n > 0; }), []);
  assert.deepEqual(codes((s) => { let m = s.t * 2; return m > 0; }), []);
  assert.deepEqual(codes((s) => { let m = Math.max(s.t, 1); return m > 0; }), []);
  assert.deepEqual(codes((s) => { let m = s.bodies[0].speed; return m > 0; }), []);
  assert.deepEqual(codes((s) => { const m = s.t > 0 ? s.t : 0; return m; }), [], "a const holding a scalar conditional");
  assert.deepEqual(codes((s) => { let b = s.bounds; b = s.bounds; return b.bogus > 0; }), ["U007"], "said once");
  assert.deepEqual(codes((s) => { let b = 0; b = s.bounds; return b > 0; }), ["U007"], "assigned later");
  assert.deepEqual(codes((s) => { let o = s.best; return o != null; }), ["U007"], "an optional");
  assert.deepEqual(codes((s) => { let o = s.bodies; return o.length; }), ["U007"], "a list");
  assert.deepEqual(codes((s) => { let k = 0; k = s.t > 0 ? s.bounds : s.bounds; return k; }), ["U007"], "a conditional of structs");
  assert.deepEqual(codes((s) => { let n = 1; n += 2; return n > s.t; }), []);
});

test("a counted loop over a list with a max accumulates a scalar into a let (reviewer probe ui2)", () => {
  const d = defineDialect({ ...dialectSrc(), state: { t: "f64", xs: list("f64", 4), bodies: list(struct({ m: "f64" })) } });
  const g = defineGrammar(d, { root: "p", constructs: { p: { opens: [name()], slots: {} } } });
  const make = (fn) => defineUI(g, { tiles: { t: { title: "T", place: { splitBelow: "stage" }, body: [{ kind: "stat", label: "x", value: fn }] } } });
  const ui = make((s) => { let n = 0; for (let i = 0; i < s.xs.length; i++) n += s.xs[i]; return n; });
  assert.ok(ui);
  assert.throws(() => make((s) => { let n = 0; for (let i = 0; i < s.bodies.length; i++) n += 1; return n; }), DefinitionError);
  assert.throws(() => make((s) => { const k = s.bodies.length; let n = 0; for (let i = 0; i < k; i++) n += 1; return n; }), DefinitionError, "bounded through a local");
  assert.throws(() => make((s) => { let k = 0; k = s.bodies.length; let n = 0; for (let i = 0; i < k; i++) n += 1; return n; }), DefinitionError, "through an assigned let");
  make((s) => { const k = s.xs.length; let n = 0; for (let i = 0; i < k; i++) n += 1; return n; });
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
  assert.deepEqual(codes((s) => { const b = s.bodies[0]; let n = 0; for (const x of b.name) n += x; return n; }), ["U007"], "over a const chain too");
  assert.deepEqual(codes((s) => { let n = 0; for (const b of s.bodies) n += 1; return n > 0; }), ["U007"]);
  assert.deepEqual(codes((s) => { let n = 0; for (const b of s.bodies) n += b.speed; return n > 0; }), ["U007"]);
  assert.deepEqual(codes((s) => { let n = 0; for (let i = 0; i < s.bodies.length; i++) n += 1; return n > 0; }), []);
});
