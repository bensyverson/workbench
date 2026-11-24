// Lowering runs the IR verifier on every kernel it makes when `switches.verify` is on:
// a broken invariant is a V… error (a kit bug), and the result has no kernel.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { lower, codes, environment } from "./fixture.js";
import { switches, lowerLambda } from "../index.js";

/**
 * Lowers with the verifier switched on or off, restoring the switch after.
 * @param {boolean} on
 * @param {Parameters<typeof lower>} args
 */
function lowerWith(on, ...args) {
  const was = switches.verify;
  switches.verify = on;
  try { return lower(...args); } finally { switches.verify = was; }
}

// The planted fault: an environment that declares a member of a type no kernel may hold, a list
// whose max is not a whole number (V003). Lowering trusts its environment's types, so it makes
// the kernel, and only the verifier inside lowering catches the kit-side bug.
const MOLE = environment.objects.Mole;
/** @type {typeof environment} */
const faulty = { ...environment, objects: { ...environment.objects, Mole: { ...MOLE, members: { ...MOLE.members, odd: { kind: "value", t: { list: "f64", max: 2.5 } } } } } };
const FAULT = "(self) => { self.ttl = self.odd.length; }";

/**
 * Lowers FAULT against the faulty environment, with the verifier switched on or off.
 * @param {boolean} on
 */
function lowerFault(on) {
  const was = switches.verify;
  switches.verify = on;
  try { return lowerLambda(faulty, FAULT, { id: "Mole.onFrame", kind: "onFrame", on: "Mole" }); } finally { switches.verify = was; }
}

test("with the switch on, a kernel that breaks an invariant is a V error with no kernel", () => {
  const r = lowerFault(true);
  assert.deepEqual([...new Set(codes(r))], ["V003"]);
  assert.equal(r.ok, false);
  assert.equal(r.kernel, null);
  const d = r.diagnostics[0];
  assert.equal(d.severity, "error");
  assert.match(d.message, /whole number/);
  assert.match(d.tip, /bug in the kit/);
  assert.equal(FAULT.slice(d.range[0], d.range[1]), "self.odd");
});

test("with the switch off, lowering does not verify", () => {
  const r = lowerFault(false);
  assert.deepEqual(codes(r), []);
  assert.ok(r.kernel);
});

test("found by the verifier: reduce's initial value keeps its effects on the statement that evaluates it", () => {
  const r = lowerWith(false, "(self, w) => { w.score = w.board.reduce((acc, m) => acc + m.ttl, w.rng.int(5)); }", "onFrame", "Mole");
  assert.ok(r.kernel);
  const init = r.kernel.body.find((s) => s.k === "let" && s.value?.k === "call");
  assert.deepEqual(init?.effects, ["rng"]);
  assert.ok(r.kernel.effects.includes("rng"));
});

test("npm test and npm run test:prerelease preload the module that turns the switch on", () => {
  const pkg = JSON.parse(readFileSync(new URL("../../../package.json", import.meta.url), "utf8"));
  for (const script of ["test", "test:prerelease"]) assert.match(pkg.scripts[script], /^node --import \.\/kit\/test\/verify-lowering\.js --test\b/, script);
  assert.match(readFileSync(new URL("../../test/verify-lowering.js", import.meta.url), "utf8"), /^switches\.verify = true;$/m);
});

test("with the switch on, valid lambdas lower as before", () => {
  for (const src of [
    "(self) => { if (self.up && --self.ttl === 0) self.up = false; }",
    "(self, w) => { for (let i = 0; i < w.param(\"burst\"); i++) { const s = w.spawn(\"sparks\"); if (s) s.vx = i; } }",
    "(self, w) => { const m = w.board.filter((b) => !b.up).find((b) => b.ttl > 0); if (m) m.up = true; }",
  ]) {
    const r = lowerWith(true, src);
    assert.deepEqual(codes(r), [], src);
    assert.ok(r.kernel, src);
  }
});
