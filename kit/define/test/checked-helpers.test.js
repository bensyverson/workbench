// @ts-nocheck: the helpers under test are plain arrows whose text is compiled, never called, so they are untyped on purpose.
// Leaf LWKjTf (decision MpZZsU, items 1, 5, 8 and issue lv8O0x): `helpers: { check: "all" }` lowers every top-level
// function, called or not; a member's `rejected` entry; the declaration keyword in `units`; and a lambda's free
// name that build-time code also declares. Each new behavior is off unless the Dialect or the host asks for it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defineDialect, defineGrammar, exact, name, lambda, DefinitionError } from "../index.js";
import { run } from "../index.js";

/**
 * An instance space (a particle `P` with a writable `n`, a verb `kill`), a total `hits`, and Math without `random`.
 * @param {Record<string, any>} [o]
 */
const harness = (o = {}) => {
  const d = defineDialect({
    name: "chk", numberType: "f64", text: () => "",
    spaces: { s: { instance: "P" } },
    objects: {
      P: { label: "the particle (p)", members: { n: { value: "f64", write: true }, kill: { fn: { params: [], returns: "void" }, effects: ["destroy P"] } }, ...o.P },
      C: { label: "the counters", members: { hits: { value: "f64", bump: true } } },
      M: { label: "Math", members: { abs: { fn: { params: ["f64"], returns: "f64" } } }, ...o.M },
    },
    globals: { counters: "C", Math: "M" },
    targets: { js: { accepts: "*", compare: exact() } },
    slots: { k: { params: ["P"], returns: "void", space: "s", may: ["write P"] } },
    helpers: { may: ["read P"], ...o.helpers },
  });
  const g = defineGrammar(d, { root: "p", constructs: { p: {
    opens: [name()],
    slots: { k: { kind: "decl", args: [lambda("k")] }, fn: { kind: "unit", unit: "fn" } },
    ...o.root,
  } } });
  return { g, d };
};

/**
 * Builds a Program whose lambda is `(p) => { }` with the given top-level bindings in scope, and lowers it.
 * @param {ReturnType<typeof harness>} h
 * @param {Record<string, unknown>} scope  its top-level bindings
 * @param {Record<string, string>} sources  their texts
 * @param {Record<string, any>} [extra]  more build options
 */
const lowered = (h, scope, sources, extra = {}) => {
  const b = h.g("x").k("(p) => { p.n = 1; }");
  const rec = b.build({ scope, sources, ...extra });
  return { rec, codes: h.g.lower(rec).diagnostics.map((x) => x.code) };
};

const ALL = { helpers: { check: "all" } };

test("by default a top-level function nothing calls is not looked at", () => {
  const h = harness();
  const bad = () => counters.hits * 2;
  const { rec, codes } = lowered(h, { bad }, { bad: String(bad) });
  assert.deepEqual(rec.units, []);
  assert.deepEqual(codes, []);
});

test("check: \"all\": an uncalled helper that reads a counter is one L004, at the helper", () => {
  const h = harness(ALL);
  const tally = () => counters.hits * 2;
  const { rec, codes } = lowered(h, { tally }, { tally: String(tally) });
  assert.deepEqual(rec.units.map((u) => u.name), ["tally"]);
  assert.deepEqual(codes, ["L004"]);
});

test("check: \"all\": an uncalled recursive helper is one L007, with no L014 for its parameter", () => {
  const h = harness(ALL);
  const countdown = (n) => (n > 0 ? countdown(n - 1) : 0);
  assert.deepEqual(lowered(h, { countdown }, { countdown: String(countdown) }).codes, ["L007"]);
});

test("check: \"all\": a helper that is not a Runtime Lambda is refused at build, once, naming the helper", () => {
  const h = harness(ALL);
  const spin = async (n) => n;
  assert.throws(() => lowered(h, { spin }, { spin: String(spin) }), (e) => e.diagnostics.length === 1 && e.diagnostics[0].code === "B007" && /top-level helper 'spin'/.test(e.diagnostics[0].message) && !/reads the top-level/.test(e.diagnostics[0].message));
  // outside the subset is the parser's diagnostic, from lowering, as for a called helper
  const loop = (n) => { while (n > 0) n--; return n; };
  assert.ok(lowered(h, { loop }, { loop: String(loop) }).codes.some((c) => c.startsWith("S")));
});

test("check: \"all\": a clean uncalled helper, one that uses its parameter, and a called one all pass; what they do with a parameter's members is not checked", () => {
  const h = harness(ALL);
  const double = (x) => x * 2;
  const reads = (p) => p.n * 2;
  const writes = (p) => { p.n = 0; };
  const { rec, codes } = lowered(h, { double, reads, writes }, { double: String(double), reads: String(reads), writes: String(writes) });
  assert.deepEqual(rec.units.map((u) => u.name), ["double", "reads", "writes"]);
  assert.deepEqual(codes, []);
  // Their parameters have no type, so they have no kernel either; the result says why.
  const results = h.g.lower(rec).helpers.map((x) => [x.name, x.result.ok, x.result.kernel, /** @type {any} */ (x.result).untyped]);
  assert.deepEqual(results, [["double", true, null, true], ["reads", true, null, true], ["writes", true, null, true]]);
});

test("check: \"all\": constants are not helpers, and a helper that is called is lowered once with its call's types", () => {
  const h = harness(ALL);
  const half = (x) => x * 0.5;
  const K = 3;
  const g = h.g("x").k("(p) => { p.n = half(K); }");
  const rec = g.build({ scope: { half, K }, sources: { half: String(half), K: "3" } });
  assert.deepEqual(rec.units.map((u) => u.name), ["half", "K"]);
  assert.deepEqual(h.g.lower(rec).diagnostics, []);
});

test("check: \"all\": run() leaves the Program's own function out", () => {
  const h = harness(ALL);
  /** @type {any} */
  const main = () => h.g("x").k("(p) => { }");
  const r = run(main, { scope: { main }, sources: { main: String(main) } });
  assert.deepEqual(r.diagnostics, []);
  assert.deepEqual(r.record?.units, []);
});

test("helpers.check: only \"all\" or \"called\" is a value", () => {
  assert.throws(() => harness({ helpers: { check: "some" } }), (e) => e instanceof DefinitionError && e.diagnostics.some((d) => d.path.join(".") === "helpers.check"));
  harness({ helpers: { check: "called" } });
});

const hasMember = (/** @type {Record<string, any>} */ o) => harness(o).g;

test("a member's rejected entry replaces \"has no member\" with its message and fix, as one L002", () => {
  const h = harness({ M: { rejected: { random: { message: "no randomness here", fix: "rng()" } } }, P: { rejected: { collide: { message: "particles never meet", tip: "keep what you need in a field" } } } });
  const lowerOne = (/** @type {string} */ src) => h.g.lower(h.g("x").k(src).build({})).diagnostics;
  const a = lowerOne("(p) => { p.n = Math.random(); }");
  assert.deepEqual(a.map((x) => x.code), ["L002"]);
  assert.match(a[0].message, /no randomness here/);
  assert.doesNotMatch(a[0].message, /has no member/);
  assert.match(a[0].tip, /rng\(\)/);
  const b = lowerOne("(p) => { p.collide(); }");
  assert.deepEqual(b.map((x) => x.code), ["L002"]);
  assert.match(b[0].message, /particles never meet/);
  assert.match(b[0].tip, /keep what you need in a field/);
  assert.deepEqual(lowerOne("(p) => { p.n = Math.abs(p.n); }"), []);
  assert.deepEqual(lowerOne("(p) => { p.nn = 1; }").map((x) => x.code), ["L002"]);
  assert.match(lowerOne("(p) => { p.nn = 1; }")[0].message, /has no member 'nn'/);
});

test("a rejected entry is malformed, or names a real member: D011 / D007", () => {
  assert.throws(() => hasMember({ M: { rejected: { random: "no" } } }), (e) => e instanceof DefinitionError && e.diagnostics.some((d) => d.code === "D011"));
  assert.throws(() => hasMember({ M: { rejected: { random: {} } } }), (e) => e instanceof DefinitionError && e.diagnostics.some((d) => d.code === "D011"));
  assert.throws(() => hasMember({ M: { rejected: { abs: { message: "no" } } } }), (e) => e instanceof DefinitionError && e.diagnostics.some((d) => d.code === "D007"));
});

test("units record the declaration keyword when the host says it, and not otherwise", () => {
  const h = harness();
  const half = (x) => x * 0.5;
  const K = 3;
  const g = () => h.g("x").k("(p) => { p.n = half(K); }");
  const plain = g().build({ scope: { half, K }, sources: { half: String(half), K: "3" } });
  assert.deepEqual(plain.units, [{ name: "half", kind: "fn", src: plain.units[0].src }, { name: "K", kind: "const", src: "3" }]);
  const withKeywords = g().build({ scope: { half, K }, sources: { half: String(half), K: "3" }, keywords: { half: "function", K: "let" } });
  assert.deepEqual(withKeywords.units.map((u) => [u.name, u.keyword]), [["half", "function"], ["K", "let"]]);
});

test("the root's check sees the units, so a Dialect can refuse a top-level let", () => {
  const h = harness({ root: { check(record, ctx) { for (const u of record.units ?? []) if (u.keyword === "let") ctx.error("R009", `the top-level '${u.name}' is a let`, { tip: "make it a const" }); } } });
  const K = 3;
  const b = () => h.g("x").k("(p) => { p.n = K; }");
  assert.deepEqual(b().check({ scope: { K }, sources: { K: "3" }, keywords: { K: "const" } }), []);
  const refused = b().check({ scope: { K }, sources: { K: "3" }, keywords: { K: "let" } });
  assert.deepEqual(refused.map((d) => d.code), ["R009"]);
});

test("keywords must be an object of const, let or function", () => {
  const h = harness();
  assert.throws(() => h.g("x").k("(p) => { }").build({ keywords: { a: "var" } }), TypeError);
  assert.throws(() => h.g("x").k("(p) => { }").build({ keywords: [] }), TypeError);
});

test("a lambda's free name that build-time code also declares is one B013, naming both", () => {
  const h = harness();
  const K = 3;
  const b = () => h.g("x").k("(p) => { p.n = K; }");
  assert.deepEqual(b().check({ scope: { K }, sources: { K: "3" }, buildTime: [], shadowed: [] }), []);
  const d = b().check({ scope: { K }, sources: { K: "3" }, shadowed: ["K"] });
  assert.deepEqual(d.map((x) => x.code), ["B013"]);
  assert.match(d[0].message, /top level and again below it, in build-time code or a helper:/);
  assert.deepEqual(h.g("x").k("(p) => { p.n = 1; }").check({ scope: { K }, sources: { K: "3" }, shadowed: ["K"] }), []);
});
