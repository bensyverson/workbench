// Per-slot effects in lowering (leaf 8vQJOw; design: project/2026-11-25-per-slot-effects-draft.md): a slot's `may`
// lists the effects its lambda may have, by prefix pattern (L004 for any other, its tip listing `may`); a total
// (`bump: true`) changes only by a `+=` or `++` statement, which lowers to the IR's bump (L017 for any other
// change, or for a read in a slot that may bump it); a helper's own `may` judges its body, and one mistake in a
// helper is one diagnostic, at the helper.
import { test } from "node:test";
import assert from "node:assert/strict";
import { lowerLambda, lowerProgram } from "../index.js";
import { dialectVector } from "../../ir/types.js";

/** @import { Environment, SlotDecl } from "../environment.js" */

const V2 = dialectVector("vec2", 2, "f64");
/** @type {Record<string, SlotDecl>} */
const SLOTS = {
  update: { params: [{ obj: "Particle" }, "f64"], returns: "void", space: "particle", forbid: [], may: ["read Particle", "write Particle", "destroy Particle", "bump Counters"] },
  force: { params: [{ obj: "Particle" }, "f64"], returns: "void", space: "particle", forbid: [], may: ["read Particle", "write Particle.vel"] },
  spawn: { params: [{ obj: "Particle" }, { obj: "Rng" }], returns: "void", space: "particle", forbid: [], may: ["read Particle", "write Particle", "rng", "bump Counters"] },
  rate: { params: ["f64"], returns: "f64", space: "emit", forbid: [], may: ["read Counters"] },
  quiet: { params: ["f64"], returns: "f64", space: "emit", forbid: [], may: [] },
  old: { params: [{ obj: "Particle" }], returns: "void", space: "particle", forbid: [] },
};

/** @type {Environment} */
const env = {
  name: "effects (test)",
  objects: {
    Particle: {
      label: "a particle (p)",
      members: {
        vel: { kind: "value", t: V2, store: { type: "value" }, effect: "read Particle.vel" },
        size: { kind: "value", t: "f64", store: { type: "value" }, effect: "read Particle.size" },
        age: { kind: "value", t: "f64" },
        kill: { kind: "fn", params: [], returns: "void", effects: ["destroy Particle"] },
      },
    },
    Rng: { label: "spawn's rng", members: {}, call: { params: [], returns: "f64", effects: ["rng"] } },
    Counters: { label: "the counters", members: { n: { kind: "value", t: "f64", bump: true, effect: "read Counters.n" } } },
  },
  list: {},
  queries: [],
  globals: { counters: { obj: "Counters" } },
  vectors: { vec2: V2 },
  slot: (r) => r.kind === "helper" ? { params: [], inferParams: true, returns: "infer", space: `helper ${r.key}`, forbid: [], may: ["read Particle"] } : SLOTS[r.kind],
};

/** @param {{ diagnostics: Array<{ code: string, severity: string }> }} r */
const errs = (r) => r.diagnostics.filter((d) => d.severity === "error").map((d) => d.code);
/** @param {string} kind @param {string} src */
const lower = (kind, src) => lowerLambda(env, src, { id: `${kind}#0`, kind, on: "jet" });

test("what a slot's may lists lowers clean: writes, a verb, a call of a callable with effects, a read of a total", () => {
  assert.deepEqual(errs(lower("update", "(p, dt) => { p.size += dt; p.vel = vec2(0, p.vel.y); if (p.age > 2) p.kill(); }")), []);
  assert.deepEqual(errs(lower("force", "(p, dt) => { p.vel = p.vel * 0.9; }")), []);
  assert.deepEqual(errs(lower("spawn", "(p, rng) => { p.size = rng(); }")), []);
  assert.deepEqual(errs(lower("rate", "(t) => counters.n > 3 ? 1 : 2")), []);
});

for (const [what, kind, src, effect] of [
  ["a write outside the member pattern", "force", "(p, dt) => { p.size = 2; }", "write Particle.size"],
  ["a verb", "spawn", "(p, rng) => { p.kill(); }", "destroy Particle"],
  ["a read of a total", "quiet", "(t) => counters.n", "read Counters.n"],
  ["a bump", "rate", "(t) => { counters.n++; return 1; }", "bump Counters.n"],
]) {
  test(`L004: ${what}, its message naming the effect and its tip the slot's may`, () => {
    const r = lower(/** @type {string} */ (kind), /** @type {string} */ (src));
    assert.deepEqual(errs(r), ["L004"]);
    const d = r.diagnostics.find((x) => x.code === "L004");
    assert.match(d?.message ?? "", new RegExp(`'${effect}'`));
    const may = SLOTS[/** @type {string} */ (kind)].may ?? [];
    assert.match(d?.tip ?? "", may.length ? new RegExp(may.map((m) => m.replace(".", "\\.")).join(".*")) : /nothing/);
  });
}

test("L004: rng() in a slot that may not draw", () => {
  /** @type {Environment} */
  const withRng = { ...env, slot: (r) => r.kind === "update" ? { ...SLOTS.update, params: [{ obj: "Particle" }, { obj: "Rng" }] } : env.slot(r) };
  assert.deepEqual(errs(lowerLambda(withRng, "(p, rng) => { p.size = rng(); }", { id: "update#0", kind: "update", on: "jet" })), ["L004"]);
});

test("a slot with no may keeps today's meaning: forbid alone judges it", () => {
  assert.deepEqual(errs(lower("old", "(p) => { p.size = 1; p.kill(); }")), []);
});

test("a += statement on a total lowers to a bump of that total, recorded bump Owner.name", () => {
  const r = lower("update", "(p, dt) => { counters.n += p.size * 2; }");
  assert.deepEqual(errs(r), []);
  const s = r.kernel?.body.find((x) => x.k === "bump");
  assert.ok(s && s.k === "bump");
  assert.equal(s.place.name, "n");
  assert.equal(s.place.total, true);
  assert.deepEqual(r.kernel?.effects.filter((e) => e.startsWith("bump")), ["bump Counters.n"]);
  assert.ok(!r.kernel?.effects.includes("read Counters.n"), "a bump reads nothing");
});

test("a ++ statement on a total lowers to a bump by one", () => {
  const r = lower("update", "(p, dt) => { counters.n++; }");
  assert.deepEqual(errs(r), []);
  const s = r.kernel?.body.find((x) => x.k === "bump");
  assert.ok(s && s.k === "bump" && s.value.k === "num" && s.value.v === 1);
});

for (const [what, body] of [
  ["assigned", "counters.n = 0;"],
  ["decreased", "counters.n -= 1;"],
  ["multiplied", "counters.n *= 2;"],
  ["counted down", "counters.n--;"],
  ["bumped as a value", "const x = counters.n++;"],
  ["bumped inside an expression", "p.size = (counters.n += 1);"],
]) {
  test(`L017: a total ${what}`, () => {
    const r = lower("update", `(p, dt) => { ${body} }`);
    assert.deepEqual(errs(r), ["L017"]);
    assert.match(r.diagnostics.find((d) => d.code === "L017")?.message ?? "", /counters\.n/);
  });
}

test("L017: a total read in a slot that may bump it, spelled as written", () => {
  const r = lower("update", "(p, dt) => { if (counters.n > 2) p.kill(); }");
  assert.deepEqual(errs(r), ["L017"]);
  assert.match(r.diagnostics.find((d) => d.code === "L017")?.message ?? "", /'counters\.n'/);
});

test("a bump must add a number: a vector is L003", () => {
  assert.deepEqual(errs(lower("update", "(p, dt) => { counters.n += p.vel; }")), ["L003"]);
});

test("a write of a writable vector member stores with the value rule", () => {
  const r = lower("force", "(p, dt) => { p.vel = vec2(1, 2); }");
  const s = r.kernel?.body.find((x) => x.k === "store");
  assert.ok(s && s.k === "store");
  assert.deepEqual(s.place.store, { type: "value" });
});

/** @param {string} lambda @param {Array<[string, string]>} helpers */
const program = (lambda, helpers) =>
  lowerProgram(env, [{ src: lambda, slot: { id: "update#0", kind: "update", on: "jet" } }], helpers.map(([name, src]) => ({ name, kind: /** @type {const} */ ("fn"), src })));

test("a helper may read its instance: it lowers, and the caller with it", () => {
  const r = program("(p, dt) => { p.size = half(p); }", [["half", "(q) => q.size / 2"]]);
  assert.deepEqual(errs(r.results[0]), []);
  assert.deepEqual(errs(r.helpers[0].result), []);
});

for (const [what, src] of [
  ["a verb in a helper", "(q) => { q.kill(); }"],
  ["a write in a helper", "(q) => { q.size = 1; }"],
  ["a read of a total in a helper", "(q) => { const k = counters.n; }"],
  ["a bump in a helper", "(q) => { counters.n++; }"],
]) {
  test(`one mistake, one diagnostic: ${what} is L004 at the helper, and the caller adds none`, () => {
    const r = program("(p, dt) => { tally(p); }", [["tally", src]]);
    assert.deepEqual(errs(r.helpers[0].result), ["L004"]);
    assert.deepEqual(errs(r.results[0]), []);
    assert.equal(r.results[0].kernel, null, "a caller of a helper that does not lower has no kernel");
    assert.equal(r.results[0].ok, false);
  });
}

// 3YNVB3 item 7 (trial 4): a loop bounded by a Definition API param (`$.n`, a read-only member, not DMG's
// w.param("n")) was told the bound "is not a constant, a param or a declared size", which reads as wrong.
test("L007 for a read-only member bound names it and says it is not declared a size", () => {
  /** @type {Environment} */
  const withParams = { ...env, globals: { ...env.globals, $: { obj: "Params" } }, objects: { ...env.objects, Params: { label: "the params ($)", members: { n: { kind: "value", t: "f64" } } } } };
  const r = lowerLambda(withParams, "(p, dt) => { for (let k = 0; k < $.n; k++) { p.size += 1; } }", { id: "update#0", kind: "update", on: "jet" });
  const d = r.diagnostics.find((x) => x.code === "L007");
  assert.ok(d);
  assert.match(d.message, /'\$\.n'/);
  assert.match(d.message, /not declared a size/);
  assert.doesNotMatch(d.message, /not a constant, a param/);
  assert.match(d.tip, /constant|length/);
});
