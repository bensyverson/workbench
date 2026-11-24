// Review of 613926f (job AtIcKn), findings 1, 2 and 6, from the reviewer's probes
// local/rev-scope-probes/{closure,bake,scope,math}.probe.js.
// @ts-nocheck: lambdas name the Dialect's free names and the module's bindings, which TypeScript cannot see.
import { test } from "node:test";
import assert from "node:assert/strict";
import { bake } from "../scope.js";
import { field } from "../../dialects/fields/grammar.js";
import { lowerField } from "../../dialects/fields/program.js";

/** "code message" for every diagnostic. @param {any[]} ds */
const show = (ds) => ds.map((d) => `${d.code} ${d.message}`);

// 1. A factory-made arrow's String(fn) loses its closure, so its free `k` resolved to an unrelated top-level `k`.
test("a scope arrow whose text is not its top-level declaration's initializer is B012, not a helper", () => {
  const k = 10;
  const mk = (k) => (x) => x * k;
  const triple = mk(3);
  const b = field("f").pixel((uv) => color(triple(uv.x), 0, 0));
  const options = { scope: { k, mk, triple }, sources: { k: "10", mk: "(k) => (x) => x * k", triple: "mk(3)" } };
  const ds = b.check(options);
  assert.deepEqual(ds.map((d) => d.code), ["B012"]);
  assert.match(ds[0].message, /'triple'/);
  assert.match(ds[0].message, /made by other code|closes over/);
  assert.match(ds[0].tip, /const triple = \(/);
  assert.throws(() => b.build(options));
});

test("a scope arrow with no declaration text is B012 too; one whose text matches is a helper", () => {
  const half = (v) => v * 0.5;
  const b = field("f").pixel((uv) => color(half(uv.x), 0, 0));
  assert.deepEqual(b.check({ scope: { half } }).map((d) => d.code), ["B012"]);
  const record = b.build({ scope: { half }, sources: { half: "(v) => v * 0.5" } });
  assert.deepEqual(record.units, [{ name: "half", kind: "fn", src: "(v) => v * 0.5" }]);
  assert.deepEqual(show(lowerField(record).diagnostics), []);
});

test("sources must be an object of strings", () => {
  assert.throws(() => field("f").pixel((uv) => color(0, 0, 0)).check({ sources: ["x"] }), /sources is an object/);
  assert.throws(() => field("f").pixel((uv) => color(0, 0, 0)).check({ sources: { x: 1 } }), /sources is an object/);
});

// 2. bake walked Object.entries: holes shifted indices, extra array keys became items, getters ran, and
// non-enumerable and Symbol keys were dropped.
test("bake refuses what is not plain data written out: holes, extra array keys, accessors, hidden and Symbol keys", () => {
  const sparse = [1, , 3];
  const extra = [1, 2]; extra.foo = 3;
  let calls = 0;
  const getter = { get x() { calls++; return 1; } };
  class Sub extends Array {}
  const sub = Sub.from([1, 2]);
  const nonEnum = {}; Object.defineProperty(nonEnum, "x", { value: 1, enumerable: false });
  const sym = { a: 1, [Symbol("s")]: 2 };
  const proto = JSON.parse('{"__proto__": 1}');
  const arrGetter = [1]; Object.defineProperty(arrGetter, 0, { get: () => 7, enumerable: true });
  for (const [label, v] of Object.entries({ sparse, extra, getter, sub, nonEnum, sym, proto, arrGetter, Math, JSON })) {
    assert.ok("error" in bake(v), `${label}: ${JSON.stringify(bake(v))}`);
  }
  assert.equal(calls, 0, "a getter is never run");
  assert.deepEqual(bake([1, [2, { a: "x" }], true]), { src: "[1, [2, { a: \"x\" }], true]" });
  assert.deepEqual(bake({ lo: 1, hi: [2, 3] }), { src: "{ lo: 1, hi: [2, 3] }" });
  assert.deepEqual(bake(Object.assign(Object.create(null), { a: 1 })), { src: "{ a: 1 }" });
  assert.deepEqual(bake([]), { src: "[]" });
});

test("a sparse array read by a lambda is B012, not baked with its indices shifted", () => {
  const A = [0.1, , 0.3];
  const ds = field("f").pixel((uv) => color(A[2], 0, 0)).check({ scope: { A } });
  assert.deepEqual(ds.map((d) => d.code), ["B012"]);
});

// 6. B012's message said "it holds a Object".
test("B012 names a builder or class instance with the right article", () => {
  const other = field("o").pixel((uv) => color(0, 0, 0));
  const ds = field("f").pixel((uv) => color(other, 0, 0)).check({ scope: { other } });
  assert.deepEqual(ds.map((d) => d.code), ["B012"]);
  assert.doesNotMatch(ds[0].message, /\ba Object\b/);
  assert.match(ds[0].message, /builder/);
  class Item {}
  const it = new Item();
  const ids = field("f").pixel((uv) => color(it, 0, 0)).check({ scope: { it } });
  assert.match(ids[0].message, /an Item\b/);
});
