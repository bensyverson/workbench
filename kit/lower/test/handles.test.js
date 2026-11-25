// The handle rule (Ben, 2026-11-25; trial 4's hidden rejects r02e, r07e, r21k, r25c): a handle the language hands
// a lambda (a slot parameter of object type, a global of object type) is used only as h.member, h.method(…),
// h(…) when the object is callable, or passed whole to a Program helper; a callable one is only called. Any other
// use is L018. A value of object type that is not a handed-in name (a local bound to a call's result, a query
// callback's item) is not a handle.
import { test } from "node:test";
import assert from "node:assert/strict";
import { lowerLambda, lowerProgram } from "../index.js";
import { lower } from "./fixture.js";

/** @import { Environment } from "../environment.js" */

/** @type {Environment} */
const env = {
  name: "handles (test)",
  objects: {
    Particle: {
      label: "Particle",
      members: {
        x: { kind: "value", t: "f64", store: { type: "f64" }, effect: "read Particle.x" },
        age: { kind: "value", t: "f64" },
        kill: { kind: "fn", params: [], returns: "void", effects: [] },
        near: { kind: "fn", params: [{ obj: "Particle" }], returns: "bool", effects: [] },
      },
    },
    Rng: { label: "the random source", members: {}, call: { params: [], returns: "f64", effects: [] } },
    Params: { label: "the params ($)", members: { wind: { kind: "value", t: "f64" } } },
    Counters: { label: "the counters", members: { n: { kind: "value", t: "f64", store: { type: "f64" }, effect: "read Counters.n" } } },
    World: { label: "the world", members: { first: { kind: "fn", params: [], returns: { obj: "Particle" }, effects: [] }, roll: { kind: "fn", params: [{ obj: "Rng" }], returns: "f64", effects: [] } } },
  },
  list: {},
  queries: [],
  globals: { $: { obj: "Params" }, counters: { obj: "Counters" } },
  slot: (r) => r.kind === "helper" ? { params: [], inferParams: true, returns: "infer", space: `helper ${r.key}`, forbid: [] } : ({ params: [{ obj: "Particle" }, { obj: "Rng" }, "f64", { obj: "World" }], returns: "void", space: "particle", forbid: [] }),
};
const ref = { id: "spawn#0", kind: "spawn", on: "jet" };
/** @param {{ diagnostics: Array<{ code: string, severity: string }> }} r */
const errs = (r) => r.diagnostics.filter((d) => d.severity === "error").map((d) => d.code);
/** @param {string} body */
const run = (body) => lowerLambda(env, `(p, rng, i, w) => { ${body} }`, ref);

const refused = [
  ["a parameter bound to a const", "const q = p; q.x = 0;", "p"],
  ["a parameter bound to a let", "let q = p;", "p"],
  ["a global bound to a local", "const s = $;", "$"],
  ["a second global bound to a local", "const c = counters; c.n = 1;", "counters"],
  ["a callable bound to a local", "const r = rng; p.x = r();", "rng"],
  ["a handle in an array", "const a = [p];", "p"],
  ["a handle in an object, shorthand", "const o = { p };", "p"],
  ["a handle in an object", "const o = { q: p };", "p"],
  ["a ternary of two handles", "const q = i > 0 ? p : p;", "p"],
  ["a callable handle passed to a method, though its parameter takes that type", "p.x = w.roll(rng);", "rng"],
  ["a handle tested as a condition", "if (p) { p.x = 1; }", "p"],
  ["a handle compared", "if (p === p) { p.x = 1; }", "p"],
  ["a handle returned", "return p;", "p"],
];
for (const [what, body, name] of refused) {
  test(`L018: ${what}`, () => {
    const r = run(body);
    assert.equal(r.kernel, null);
    const d = r.diagnostics.find((x) => x.code === "L018");
    assert.ok(d, errs(r).join(","));
    assert.match(d.message, new RegExp(`'${name.replace("$", "\\$")}'`));
  });
}

test("L018's tip names the allowed uses, and a callable one's says to call it", () => {
  const d = run("const q = p;").diagnostics.find((x) => x.code === "L018");
  assert.match(d?.tip ?? "", /p\.member/);
  assert.match(d?.tip ?? "", /argument of a call/);
  const c = run("const r = rng;").diagnostics.find((x) => x.code === "L018");
  assert.match(c?.tip ?? "", /rng\(/);
  assert.doesNotMatch(c?.tip ?? "", /argument/);
});

test("one aliasing mistake is one diagnostic: the alias's later use reports nothing more", () => {
  assert.deepEqual(errs(run("const q = p; q.x = 0;")), ["L018"]);
});

test("a handle's allowed uses lower clean: members read and written, methods, a call of a callable, globals' members", () => {
  const r = run("p.x = p.x + rng() + $.wind + p.age; counters.n = counters.n + 1; p.kill(); const m = w.first(); if (p.near(m)) { p.x = 0; }");
  assert.deepEqual(errs(r), []);
  assert.ok(r.kernel);
});

test("a value of object type that is not handed in is no handle: a local bound to a call's result may be passed and aliased", () => {
  const r = run("const m = w.first(); const n = m; if (p.near(n)) { p.x = 0; }");
  assert.deepEqual(errs(r), []);
});

const program = (/** @type {string} */ lambda, /** @type {Array<[string, string]>} */ helpers) =>
  lowerProgram(env, [{ src: lambda, slot: ref }], helpers.map(([name, src]) => ({ name, kind: /** @type {const} */ ("fn"), src })));

test("a handle passed whole to a Program helper lowers, and the helper's parameter may be read, written and passed on", () => {
  const r = program("(p, rng, i, w) => { push(p, $); }", [["push", "(q, s) => { q.x = q.x + s.wind; nudge(q); }"], ["nudge", "(o) => { o.kill(); }"]]);
  assert.deepEqual(errs(r.results[0]), []);
  for (const h of r.helpers) assert.deepEqual(errs(h.result), [], h.name);
});

test("L018: a callable handle passed to a helper", () => {
  const r = program("(p, rng, i, w) => { p.x = pick(rng, 2); }", [["pick", "(r, s) => s"]]);
  assert.ok(errs(r.results[0]).includes("L018"), errs(r.results[0]).join(","));
});

test("L018: a helper's parameter that receives a handle, aliased inside the helper", () => {
  const r = program("(p, rng, i, w) => { push(p); }", [["push", "(q) => { const o = q; o.x = 0; }"]]);
  const h = r.helpers.find((x) => x.name === "push");
  assert.ok(h && errs(h.result).includes("L018"), h ? errs(h.result).join(",") : "no helper");
});

test("DMG: a value of object type bound to a local stays legal, as before (w.spawn, for…of over the board)", () => {
  assert.deepEqual(errs(lower("(self, w) => { const m = w.spawn(\"sparks\"); if (m) m.life = 3; for (const k of w.board) k.up = false; }")), []);
});

test("a non-callable handle passed whole to a Dialect method lowers, as to a helper (coordinator, 2026-11-25)", () => {
  assert.deepEqual(errs(run("if (p.near(p)) { p.x = 0; }")), []);
});

test("a handle passed to a method is still type-checked by the call: the wrong object is L003, not L018", () => {
  const codes = errs(run("const b = p.near(w);"));
  assert.ok(codes.includes("L003"), codes.join(","));
  assert.ok(!codes.includes("L018"), codes.join(","));
});

test("DMG: w.overlap(self, b) lowers clean: an entity handle passed to a Dialect method", () => {
  assert.deepEqual(errs(lower("(self, w) => { const b = w.board.at(0); if (w.overlap(self, b)) self.up = true; }")), []);
});

test("DMG: self and w are handles too", () => {
  assert.ok(errs(lower("(self, w) => { const me = self; me.up = true; }")).includes("L018"));
  assert.ok(errs(lower("(self, w) => { const ww = w; ww.score = 1; }", "onFrame", "Mole")).includes("L018"));
});
