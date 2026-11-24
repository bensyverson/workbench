// Module scope (leaf gS9dBz; the ruling is project/2026-11-24-architecture-synthesis.md §3.2): a host passes the
// file's top-level bindings to `.check({ scope })` / `.build({ scope })`, and a lambda's free name that one of
// them holds resolves into the record's units, transitively: an arrow function is a helper, plain data a
// baked constant, as DMG lowering takes a program's top-level consts. Anything else is refused with a fix; a
// name the host lists as build-time only is B013, not B008; a binding named like a Dialect, Library or Program
// name is B002.
// @ts-nocheck: lambdas name the Dialect's free names and the module's bindings, which TypeScript cannot see.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defineDialect, defineGrammar, name, lambda, exact, DefinitionError } from "../index.js";
import { field } from "../../dialects/fields/grammar.js";
import { lowerField } from "../../dialects/fields/program.js";
import { program } from "../../dialects/data/grammar.js";

const tiny = defineDialect({
  name: "tiny", numberType: "f64", text: () => "", constants: { calls: "pure" },
  globals: { origin: "f64" },
  spaces: { row: { pure: true } },
  targets: { js: { accepts: "*", compare: exact() } },
  slots: { keep: { params: ["f64"], returns: "f64", space: "row" } },
});
const g = defineGrammar(tiny, {
  root: "c",
  constructs: { c: { opens: [name()], slots: { fn: { kind: "unit", unit: "fn" }, const: { kind: "unit", unit: "const" }, keep: { kind: "decl", args: [lambda("keep")], once: true } } } },
});
/** The same, with no unit slot on the root. */
const bare = defineGrammar(tiny, { root: "c", constructs: { c: { opens: [name()], slots: { keep: { kind: "decl", args: [lambda("keep")], once: true } } } } });

/** "code message" for every diagnostic. @param {any[]} ds */
const show = (ds) => ds.map((d) => `${d.code} ${d.message}`);
/** Lowers a record, returning every diagnostic as "code message". @param {any} grammar @param {any} record */
const lowered = (grammar, record) => show(grammar.lower(record).diagnostics);

test("a free name the scope holds as a number becomes a constant unit, and lowers", () => {
  const K = 2;
  const record = g("c").keep((x) => x * K).build({ scope: { K } });
  assert.deepEqual(record.units, [{ name: "K", kind: "const", src: "2" }]);
  assert.deepEqual(lowered(g, record), []);
});

test("a free name the scope holds as an arrow function becomes a helper unit, and lowers as a helper Kernel", () => {
  const half = (v) => v * 0.5;
  const record = g("c").keep((x) => half(x) + 1).build({ scope: { half } });
  assert.deepEqual(record.units, [{ name: "half", kind: "fn", src: String(half) }]);
  const out = g.lower(record);
  assert.deepEqual(show(out.diagnostics), []);
  assert.ok(out.helpers.some((h) => h.name === "half" && h.result.kernel));
});

test("resolution is transitive: a helper's own free names resolve against the scope, each once", () => {
  const SCALE = 3;
  const sq = (v) => v * v;
  const f = (v) => sq(v) * SCALE + sq(1);
  const record = g("c").keep((x) => f(x) + SCALE).build({ scope: { f, sq, SCALE, unused: 9 } });
  assert.deepEqual(record.units.map((u) => `${u.kind} ${u.name}`).sort(), ["const SCALE", "fn f", "fn sq"]);
  assert.deepEqual(lowered(g, record), []);
});

test("a Program constant may read a top-level constant: resolved units come before the declared ones", () => {
  const record = g("c").const("J", "K * 2").keep((x) => x + J).build({ scope: { K: 3 } });
  assert.deepEqual(record.units.map((u) => u.name), ["K", "J"]);
  assert.deepEqual(lowered(g, record), []);
});

test("strings, booleans, arrays and plain objects are baked as literal source", () => {
  const scope = { S: "west", B: true, A: [1, 2.5, -3], O: { lo: 1, hi: [2, 3] }, N: -0.25 };
  const record = g("c").keep((x) => (B && S === "west" ? x + A[1] + O.lo + O.hi[0] + N : x)).build({ scope });
  const src = Object.fromEntries(record.units.map((u) => [u.name, u.src]));
  assert.deepEqual(src, { B: "true", S: '"west"', A: "[1, 2.5, -3]", O: "{ lo: 1, hi: [2, 3] }", N: "-0.25" });
  assert.deepEqual(lowered(g, record), []);
});

test("a value that is not plain data is B012 with a fix, and the rest of the Program still resolves", () => {
  for (const [label, v] of [["a Map", new Map()], ["null", null], ["NaN", NaN], ["a class instance", new (class P {})()], ["an object holding a function", { f: () => 1 }], ["a key that is not a name", { "a-b": 1 }]]) {
    const ds = g("c").keep((x) => x + V + K).check({ scope: { V: v, K: 1 } });
    assert.deepEqual(ds.map((d) => d.code), ["B012"], label);
    assert.match(ds[0].message, /'V'/);
    assert.match(ds[0].tip, /number|string|top level|\.const/);
  }
});

test("a function that is not an arrow is B007, with the arrow form as the fix", () => {
  function twice(v) { return v * 2; }
  const ds = g("c").keep((x) => twice(x)).check({ scope: { twice } });
  assert.deepEqual(ds.map((d) => d.code), ["B007"]);
  assert.match(ds[0].tip, /const twice = \(/);
});

test("a name the host lists as build-time only is B013 with a fix, not B008; an unknown name stays B008", () => {
  const ds = g("c").keep((x) => x * k + nope).check({ scope: {}, buildTime: ["k"] });
  assert.deepEqual(ds.map((d) => d.code), ["B013", "B008"]);
  assert.match(ds[0].message, /"k"/);
  assert.match(ds[0].tip, /top level/);
  assert.match(ds[0].tip, /\$\{k\}/);
  assert.equal(ds[0].lambda.src, "(x) => x * k + nope");
});

test("a helper resolved from the scope that reads a build-time local is B013, naming the helper", () => {
  const h = (v) => v * depth;
  const ds = g("c").keep((x) => h(x)).check({ scope: { h }, buildTime: ["depth"] });
  assert.deepEqual(ds.map((d) => d.code), ["B013"]);
  assert.match(ds[0].message, /helper 'h'/);
});

test("a top-level binding named like a Dialect global, a fields intrinsic or Library entry, or a Program unit is B002: rename it", () => {
  assert.deepEqual(g("c").keep((x) => x).check({ scope: { origin: 1 } }).map((d) => `${d.code} ${d.tip}`), ["B002 rename the top-level 'origin'"]);
  const fds = field("f").pixel((uv, u) => color(uv.x, 0, 0)).check({ scope: { fbm: (p) => 0, sin: 1, vec2: 2 } });
  assert.deepEqual(fds.map((d) => d.code), ["B002", "B002", "B002"]);
  assert.match(fds[0].message, /the Library/);
  const uds = g("c").const("K", "1").keep((x) => x + K).check({ scope: { K: 1 } });
  assert.deepEqual(uds.map((d) => d.code), ["B002"]);
});

test("without a scope, build and check are as before: a free name is B008 and the record gains no units", () => {
  assert.deepEqual(g("c").keep((x) => x * K).check().map((d) => d.code), ["B008"]);
  assert.equal("units" in bare("c").keep((x) => x).build({ scope: { K: 1 } }), false);
});

test("a root with no unit slot takes resolved units under its record's units", () => {
  const sq = (v) => v * v;
  const record = bare("c").keep((x) => sq(x)).build({ scope: { sq } });
  assert.deepEqual(record.units, [{ name: "sq", kind: "fn", src: String(sq) }]);
  assert.deepEqual(lowered(bare, record), []);
});

test("the root construct may not put anything else under the record key units (D017)", () => {
  assert.throws(() => defineGrammar(tiny, { root: "c", constructs: { c: { opens: [name()], slots: { units: { kind: "decl", args: [lambda("keep")] } } } } }), (e) => e instanceof DefinitionError && e.diagnostics.some((d) => d.code === "D017"));
});

test("a fields Program's top-level helper and constant lower as in DMG: a helper Kernel, and a baked constant", () => {
  const RING = 0.3;
  const ring = (d) => fract(d / RING);
  const record = field("rings").pixel((uv, u) => color(ring(length(uv)), RING, 0)).build({ scope: { RING, ring } });
  const out = lowerField(record);
  assert.deepEqual(show(out.diagnostics), []);
  assert.ok(out.kernel);
  assert.ok(out.helpers.some((h) => h.name === "ring" && h.result.kernel));
});

test("a data Program's top-level constant and helper lower in a table's lambdas", () => {
  const MIN = 10;
  const big = (n) => n >= MIN;
  const record = program("p")
    .source("sales", { csv: "s.csv", columns: { region: "str", units: "f64" } })
    .table("t", "sales").filter((row) => big(row.units) && row.region !== REGION)
    .build({ scope: { MIN, big, REGION: "west" } });
  const out = program.lower(record);
  assert.deepEqual(show(out.diagnostics), []);
  assert.deepEqual(record.units.map((u) => u.name).sort(), ["MIN", "REGION", "big"]);
});

test("a data Program's lambda reading a build-time loop variable is refused with B013 and its fix", () => {
  const b = program("p").source("sales", { csv: "s.csv", columns: { units: "f64" } }).table("t", "sales");
  for (const cut of [5]) b.filter((row) => row.units > cut);
  const ds = b.check({ scope: {}, buildTime: ["cut"] });
  assert.deepEqual(ds.map((d) => d.code), ["B013"]);
});
