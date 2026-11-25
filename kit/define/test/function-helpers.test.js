// 3YNVB3 items 2 and 6: a top-level function declaration is a helper exactly like its arrow twin (decided
// 2026-11-25), and B013 says what a name is when it is another lambda's parameter.
// @ts-nocheck: lambdas name the Dialect's free names and the module's bindings, which TypeScript cannot see.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defineDialect, defineGrammar, name, lambda, exact } from "../index.js";
import { topLevelBindings, topLevelFunctions } from "../../parse/toplevel.js";

const tiny = defineDialect({
  name: "tiny", numberType: "f64", text: () => "", constants: { calls: "pure" },
  spaces: { row: { pure: true } },
  targets: { js: { accepts: "*", compare: exact() } },
  slots: { keep: { params: ["f64"], returns: "f64", space: "row" }, other: { params: ["f64"], returns: "f64", space: "row" } },
});
const g = defineGrammar(tiny, {
  root: "c",
  constructs: { c: { opens: [name()], slots: { fn: { kind: "unit", unit: "fn" }, keep: { kind: "decl", args: [lambda("keep")], once: true }, other: { kind: "decl", args: [lambda("other")], once: true } } } },
});

/** What a host gathers from a program file's text and module: its scope and each declaration's text. @param {string} code @param {Record<string, unknown>} scope */
const host = (code, scope) => ({ scope, sources: Object.fromEntries([...topLevelBindings(code).filter((b) => b.keyword === "const"), ...topLevelFunctions(code)].map((b) => [b.name, b.init])) });
const codes = (ds) => ds.map((d) => d.code);

test("a top-level function declaration called from a lambda checks clean and lowers to its arrow twin's kernel", () => {
  function half(v) { return v * 0.5; }
  const decl = host("function half(v) { return v * 0.5; }\n", { half });
  const record = g("c").keep((x) => half(x) + 1).build(decl);
  assert.deepEqual(record.units, [{ name: "half", kind: "fn", src: "(v) => { return v * 0.5; }" }]);
  assert.deepEqual(g("c").keep((x) => half(x) + 1).check(decl), []);
  const arrow = (v) => { return v * 0.5; };
  const twin = g("c").keep((x) => arrow(x) + 1).build(host("const arrow = (v) => { return v * 0.5; };\n", { arrow }));
  const a = g.lower(record), b = g.lower(twin);
  assert.deepEqual(a.diagnostics, []);
  assert.deepEqual(a.helpers.find((h) => h.name === "half").result.kernel.body, b.helpers.find((h) => h.name === "arrow").result.kernel.body);
});

test("export and a comment before the declaration change nothing; a helper may call another declaration", () => {
  function sq(v) { return v * v; }
  function f(v) { return sq(v) + 1; }
  const code = "// doc\nexport function sq(v) { return v * v; }\nfunction f(v) { return sq(v) + 1; }\n";
  const o = host(code, { sq, f });
  assert.deepEqual(g("c").keep((x) => f(x)).check(o), []);
  assert.deepEqual(g("c").keep((x) => f(x)).build(o).units.map((u) => u.name).sort(), ["f", "sq"]);
});

test("a recursive declaration behaves as its arrow twin: the caller is blocked with the helper's diagnostic", () => {
  function r(v) { return r(v - 1); }
  const record = g("c").keep((x) => r(x)).build(host("function r(v) { return r(v - 1); }\n", { r }));
  const out = g.lower(record);
  assert.ok(out.diagnostics.some((d) => d.code === "L007"), JSON.stringify(out.diagnostics.map((d) => d.code)));
});

test("an async function and a generator are B007", () => {
  async function a(v) { return v; }
  function* gen(v) { yield v; }
  for (const [label, fn, code] of [["async", a, "async function a(v) { return v; }"], ["generator", gen, "function* gen(v) { yield v; }"]]) {
    const n = fn.name;
    const ds = g("c").keep((x) => a(x) + gen(x)).check(host(code, { [n]: fn }));
    assert.ok(ds.some((d) => d.code === "B007" && new RegExp(`'${n}'`).test(d.message)), `${label}: ${JSON.stringify(ds.map((d) => `${d.code} ${d.message}`))}`);
    assert.ok(ds.every((d) => d.code === "B007" || d.code === "B008"), label);
  }
});

test("a function expression in a const stays B007 with the arrow tip", () => {
  const twice = function (v) { return v * 2; };
  const ds = g("c").keep((x) => twice(x)).check(host("const twice = function (v) { return v * 2; };\n", { twice }));
  assert.deepEqual(codes(ds), ["B007"]);
  assert.match(ds[0].tip, /const twice = \(/);
});

test("a declaration whose text is not the one the host found is B012, as an arrow is", () => {
  function nested(v) { return v; }
  // a function declared in the export's block body: no top-level declaration writes it
  const none = g("c").keep((x) => nested(x)).check({ scope: { nested }, sources: {} });
  assert.deepEqual(codes(none), ["B012"]);
  const other = g("c").keep((x) => nested(x)).check({ scope: { nested }, sources: { nested: "function nested(v) { return v + 1; }" } });
  assert.deepEqual(codes(other), ["B012"]);
  // the arrow twin, for comparison
  const arrow = (v) => v;
  assert.deepEqual(codes(g("c").keep((x) => arrow(x)).check({ scope: { arrow }, sources: {} })), ["B012"]);
});

test("a declaration whose body is outside the subset is refused as its arrow twin is (B007, the parser's reason)", () => {
  function bad(v) { try { return v; } catch (e) { return 0; } }
  const arrow = (v) => { try { return v; } catch (e) { return 0; } };
  const a = g("c").keep((x) => bad(x)).check(host("function bad(v) { try { return v; } catch (e) { return 0; } }\n", { bad }));
  const b = g("c").keep((x) => arrow(x)).check(host("const arrow = (v) => { try { return v; } catch (e) { return 0; } };\n", { arrow }));
  assert.deepEqual(codes(a), ["B007"]);
  assert.deepEqual(codes(b), ["B007"]);
  assert.match(a[0].message, /P004/);
});

test("B013 for another lambda's parameter says so, once; the build-time case keeps its message", () => {
  const ds = g("c").keep((x) => x + 1).other((y) => y * rng()).check({ scope: {}, buildTime: ["rng", "x"] });
  // rng is no one's parameter here: genuine build-time
  assert.deepEqual(codes(ds), ["B013"]);
  assert.match(ds[0].message, /declares only inside build-time code/);
  const both = g("c").keep((rng) => rng + 1).other((y) => y * rng(y)).check({ scope: {}, buildTime: ["rng"] });
  assert.deepEqual(codes(both), ["B013"]);
  assert.match(both[0].message, /"rng" is a parameter of another lambda, not a name this lambda can see/);
  assert.match(both[0].tip, /pass it in|move the use/);
  assert.doesNotMatch(both[0].message, /build-time code/);
});

test("an effect or a may naming a prototype property is D021, not an object", async () => {
  const { defineDialect } = await import("../index.js");
  const { gardenDef } = await import("../fixtures/garden-dialect.js");
  for (const eff of ["bump toString", "read constructor"]) {
    const def = gardenDef();
    def.objects.Rng.effects = ["rng", eff];
    assert.throws(() => defineDialect(def), (e) => e.diagnostics.some((d) => d.code === "D021"), eff);
  }
  for (const may of ["bump toString", "read constructor"]) {
    const def = gardenDef();
    def.slots.rain.may = ["read Totals", may];
    assert.throws(() => defineDialect(def), (e) => e.diagnostics.some((d) => d.code === "D021"), may);
  }
});
