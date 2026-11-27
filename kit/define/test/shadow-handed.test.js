// The shadow rule with the file's text (issue JYmuWM): a host passes `file` (moduleScope does), and kit/define runs
// the shadow scan itself, naming the Runtime Lambdas it was handed as compiled. A lambda's own parameter, beside a
// query callback, then shadows nothing; a build-time function that binds a top-level name still does.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defineDialect, defineGrammar, exact, name, lambda, run, withScope, moduleScope } from "../index.js";

const d = defineDialect({
  name: "sh", numberType: "f64", text: () => "", spaces: { s: { pure: true } },
  objects: { P: { label: "p", members: { n: "f64", x: "f64" } } }, targets: { js: { accepts: "*", compare: exact() } },
  slots: { update: { params: ["P", "f64"], returns: "f64", space: "s" }, spawn: { params: ["P"], returns: "f64", space: "s" } },
});
const g = defineGrammar(d, {
  root: "p",
  constructs: { p: { opens: [name()], slots: { update: { kind: "decl", args: [lambda("update")] }, spawn: { kind: "decl", args: [lambda("spawn")] } } } },
});
const KEY = "__shadowHandedBuilder";
/** @type {Record<string, unknown>} */ (globalThis)[KEY] = g;

/** A Program file's text, built with withScope and moduleScope as the page host does. @param {string} body */
async function build(body) {
  const text = `const b = globalThis.${KEY};\n${body}`;
  const mod = await import(`data:text/javascript,${encodeURIComponent(withScope(text))}`);
  return run(mod.default, moduleScope(text, mod));
}
const codes = (/** @type {{ diagnostics: Array<{ code: string }> }} */ r) => r.diagnostics.map((x) => x.code);

test("a Runtime Lambda holding a query callback does not make another lambda's read of the top-level name B013", async () => {
  const r = await build("const dt = 0.1;\nexport default () => b(\"x\").update((p, dt) => p.items.some((q) => q.x > dt)).spawn((p) => p.x * dt);");
  assert.deepEqual(r.diagnostics, []);
  assert.ok(r.record);
});

test("a build-time callback holding a lambda that reads the callback's parameter is still B013", async () => {
  const r = await build("const K = 1;\nexport default () => b(\"x\").spawn([2].map((K) => (p) => p.n * K)[0]);");
  assert.deepEqual(codes(r), ["B013"]);
});

test("a helper (no lambda) holding a callback still makes a lambda's read of the name B013", async () => {
  const r = await build("const K = 1;\nconst give = (K) => b(\"x\").spawn((p) => p.n * K);\nexport default () => give(2);");
  assert.deepEqual(codes(r), ["B013"]);
});

test("a lambda reading a name that another build-time function binds is still B013", async () => {
  const r = await build("const dt = 0.1;\nfunction step(dt) { return [1].map((x) => x * dt); }\nexport default () => b(\"x\").spawn((p) => p.x * dt);");
  assert.deepEqual(codes(r), ["B013"]);
});

test("a lambda given as text is no proof the file's arrow of that text was handed", () => {
  const file = "const dt = 0.1;\nexport default () => b().update((p, dt) => p.items.some((q) => q.x > dt)).spawn((p) => p.x * dt);";
  const dt = 0.1;
  const prog = () => g("x").update("(p, dt) => p.items.some((q) => q.x > dt)").spawn("(p) => p.x * dt");
  assert.deepEqual(prog().check({ scope: { dt }, sources: { dt: "0.1" }, file }).map((/** @type {{ code: string }} */ x) => x.code), ["B013"]);
  assert.deepEqual(prog().check({ scope: { dt }, sources: { dt: "0.1" } }), [], "without the file nothing is shadowed");
});

test("an explicit shadowed list still refuses, beside the file", () => {
  const dt = 0.1;
  const file = "const dt = 0.1;\nexport default () => 0;";
  assert.deepEqual(g("x").spawn("(p) => p.x * dt").check({ scope: { dt }, sources: { dt: "0.1" }, file, shadowed: ["dt"] }).map((/** @type {{ code: string }} */ x) => x.code), ["B013"]);
});

test("file must be the module's text", () => {
  assert.throws(() => g("x").spawn("(p) => p.x").check(/** @type {any} */ ({ file: 3 })), { name: "TypeError", message: /build\(\{ file \}\): file is the module's source text/ });
  assert.throws(() => run(() => g("x"), /** @type {any} */ ({ file: 3 })), { name: "TypeError", message: /build\(\{ file \}\): file is the module's source text/ });
});
