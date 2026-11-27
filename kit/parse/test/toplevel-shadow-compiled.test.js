// buildTimeShadows(code, compiled) (issue JYmuWM): `compiled` is the source text of each function a host knows is
// compiled rather than run (kit/define passes the Runtime Lambdas it was handed). A function the file writes once with
// one of those texts binds no shadow, nor does anything inside it: its names are runtime names of its own text. Every
// other function counts as before, so the scan stays fail closed for a text it cannot place. Each test that pins a
// shadow kept also pins the exclusion beside it, so none passes before the list is read.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTimeShadows } from "../toplevel.js";

const UPDATE = "(p, dt) => p.items.some((q) => q.x > dt)";
const SPAWN = "(p) => p.x * dt";
const PROBE = `const dt = 0.1;\nexport default () => b().update(${UPDATE}).spawn(${SPAWN});`;

test("a compiled lambda holding a query callback binds no shadow", () => {
  assert.deepEqual(buildTimeShadows(PROBE), ["dt"], "without the list the scan cannot tell it from a build-time callback");
  assert.deepEqual(buildTimeShadows(PROBE, [UPDATE, SPAWN]), []);
});

test("nothing inside a compiled lambda binds a shadow: a nested callback that holds one, a local in build code", () => {
  const nested = "(p, n) => p.xs.some((y) => y.zs.some((z) => z > y.k))";
  assert.deepEqual(buildTimeShadows(`const y = 1;\nexport default () => b().update(${nested});`, [nested]), []);
  const local = "(p) => { const K = 2; return p.x * K; }";
  const code = `const K = 1;\nexport default () => { return b().update(${local}); };`;
  assert.deepEqual(buildTimeShadows(code), ["K"]);
  assert.deepEqual(buildTimeShadows(code, [local]), []);
});

test("a build-time callback holding a lambda that reads its parameter still binds a shadow", () => {
  const lambda = "(p) => p.n * K";
  assert.deepEqual(buildTimeShadows(`const K = 1;\nexport default () => b().k([2].map((K) => ${lambda})[0]);`, [lambda]), ["K"]);
  assert.deepEqual(buildTimeShadows(`const K = 1;\nexport default () => b().k([2].map((K) => ${lambda})[0]);`, [`(K) => ${lambda}`]), [], "only when the callback itself is no lambda");
});

test("a helper (no lambda) holding a callback still binds a shadow", () => {
  assert.deepEqual(buildTimeShadows("const K = 1;\nconst g = (K) => b().k((p) => K);\nexport default () => g(2);", ["(p) => K"]), ["K"]);
  const step = "function step(dt) { return [1].map((x) => x * dt); }";
  const code = `const dt = 0.1;\nconst s = ${step};\nexport default () => b().spawn((p) => p.x * dt);`;
  assert.deepEqual(buildTimeShadows(code, ["(p) => p.x * dt"]), ["dt"], "a lambda's read of a name another build-time function binds");
  assert.deepEqual(buildTimeShadows(code, ["(p) => p.x * dt", step]), [], "a function expression named compiled is excluded the same way");
});

test("the export's own parameter still counts when the export holds a function, whatever the list holds", () => {
  const code = "const k = 1;\nexport default (k) => { [1].map((x) => x); return 1; };";
  assert.deepEqual(buildTimeShadows(code, ["(x) => x"]), ["k"]);
  assert.deepEqual(buildTimeShadows(code, ["(k) => { [1].map((x) => x); return 1; }"]), [], "only its own text excludes it");
});

test("a compiled text the file writes twice excludes neither copy (fail closed)", () => {
  const twice = `const dt = 0.1;\nexport default () => b().update(${UPDATE}).spawn(${SPAWN}).other([1].map(${UPDATE}));`;
  assert.deepEqual(buildTimeShadows(twice, [UPDATE, SPAWN]), ["dt"]);
  assert.deepEqual(buildTimeShadows(PROBE, [UPDATE, SPAWN]), []);
});

test("a text the file does not write, or writes as no function, excludes nothing", () => {
  const code = `const dt = 0.1;\nexport default () => b().update(${UPDATE}).note("${UPDATE}");`;
  assert.deepEqual(buildTimeShadows(code, ["(p, dt) => p.items.some((q) => q.x >= dt)", "p.items.some((q) => q.x > dt)"]), ["dt"]);
  assert.deepEqual(buildTimeShadows(code, [UPDATE]), []);
});
