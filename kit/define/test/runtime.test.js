// defineRuntime: a package's runtime module, plain trusted JS over its own state (the clocks draft, as ruled
// 2026-11-26). The kit checks the declaration (D033), reads the clock as exact rational time, and says which
// Event ports a runtime bounds per step.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defineRuntime, isRuntime, clockOf, DefinitionError, DEFINE_CODES } from "../index.js";
import { q, fromNumber, add, sub, mul, div, cmp, floorDiv, ceilDiv, qText, toNumber } from "../rational.js";
import { maze, particles } from "../fixtures/seams-dialects.js";

const noop = { clock: () => ({ tick: 1 / 8 }), init: () => ({}), step: (/** @type {any} */ s) => s };
/** @param {() => unknown} f */
const codesOf = (f) => {
  try { f(); } catch (e) { if (e instanceof DefinitionError) return /** @type {any} */ (e).diagnostics.map((/** @type {any} */ d) => d.code); throw e; }
  return [];
};

test("defineRuntime returns a frozen Runtime on its Grammar, with each Event port's per-step max", () => {
  const g = maze();
  const r = defineRuntime(g, { ...noop, events: { out: { picked: 8 } } });
  assert.ok(isRuntime(r));
  assert.ok(Object.isFrozen(r));
  assert.equal(r.grammar, g);
  assert.equal(r.dialect, g.dialect);
  assert.deepEqual(r.events, { out: { picked: 8 }, in: {} });
  assert.equal(isRuntime({ ...r }), false);
  assert.equal(DEFINE_CODES.D033.length > 0, true);
});

test("D033: not a Grammar, a missing or non-function clock, init or step, an unknown key", () => {
  assert.deepEqual(codesOf(() => defineRuntime(/** @type {any} */ ({}), noop)), ["D033"]);
  assert.deepEqual(codesOf(() => defineRuntime(maze(), /** @type {any} */ ({ clock: noop.clock, init: noop.init, events: { out: { picked: 1 } } }))), ["D033"]);
  assert.deepEqual(codesOf(() => defineRuntime(maze(), /** @type {any} */ ({ ...noop, step: 3, events: { out: { picked: 1 } } }))), ["D033"]);
  assert.deepEqual(codesOf(() => defineRuntime(maze(), /** @type {any} */ ({ ...noop, tick: 1, events: { out: { picked: 1 } } }))), ["D033"]);
});

test("D033: every Event port needs a whole positive max, and only Event ports take one", () => {
  // maze's Event output picked has no max
  assert.deepEqual(codesOf(() => defineRuntime(maze(), noop)), ["D033"]);
  // a max on a value output, on a port the Dialect lacks, and a max that is not whole and positive
  assert.deepEqual(codesOf(() => defineRuntime(maze(), { ...noop, events: { out: { picked: 8, score: 2 } } })), ["D033"]);
  assert.deepEqual(codesOf(() => defineRuntime(maze(), { ...noop, events: { out: { picked: 8, pickd: 2 } } })), ["D033"]);
  assert.deepEqual(codesOf(() => defineRuntime(maze(), { ...noop, events: { out: { picked: 0.5 } } })), ["D033"]);
  // particles' Event input burst needs its max too
  assert.deepEqual(codesOf(() => defineRuntime(particles(), noop)), ["D033"]);
  assert.ok(isRuntime(defineRuntime(particles(), { ...noop, events: { in: { burst: 4 } } })));
});

test("D033: an input that keeps the last n records takes a max of at least n", async () => {
  const { defineDialect } = await import("../index.js");
  const { particlesDecl, particlesGrammar } = await import("../fixtures/seams-dialects.js");
  const decl = particlesDecl();
  decl.ports.in.burst.delivery = { keepLast: 6 };
  const g = particlesGrammar(defineDialect(/** @type {any} */ (decl)));
  assert.deepEqual(codesOf(() => defineRuntime(g, { ...noop, events: { in: { burst: 4 } } })), ["D033"]);
  assert.ok(isRuntime(defineRuntime(g, { ...noop, events: { in: { burst: 6 } } })));
});

test("clockOf reads tick seconds as an exact rational, and frame and demand clocks", () => {
  const r = (/** @type {any} */ clock) => defineRuntime(maze(), { ...noop, clock, events: { out: { picked: 1 } } });
  assert.deepEqual(clockOf(r(() => ({ tick: 1 / 30 })), {}), { ok: true, clock: { kind: "tick", period: q(1, 30) } });
  assert.deepEqual(clockOf(r((/** @type {any} */ rec) => ({ tick: rec.tick ?? 1 / 8 })), { tick: 0.25 }), { ok: true, clock: { kind: "tick", period: q(1, 4) } });
  assert.deepEqual(clockOf(r(() => ({ frame: true })), {}), { ok: true, clock: { kind: "frame" } });
  assert.deepEqual(clockOf(r(() => ({ demand: true })), {}), { ok: true, clock: { kind: "demand" } });
  for (const bad of [() => ({ tick: 0 }), () => ({ tick: -1 }), () => ({ tick: Math.PI / 1e7 }), () => ({}), () => ({ tick: 1, frame: true }), () => 3, () => { throw new Error("boom"); }]) {
    const c = clockOf(r(bad), {});
    assert.equal(c.ok, false, String(bad));
    assert.equal(typeof (/** @type {any} */ (c).error), "string");
  }
});

test("rational time: 1/8 and 1/30 meet exactly at 1/2", () => {
  const a = q(1, 8), b = q(1, 30);
  assert.deepEqual(mul(a, q(4)), q(1, 2));
  assert.deepEqual(mul(b, q(15)), q(1, 2));
  assert.equal(cmp(mul(a, q(4)), mul(b, q(15))), 0);
  assert.deepEqual(add(q(1, 8), q(1, 30)), q(19, 120));
  assert.deepEqual(sub(q(1, 2), q(1, 8)), q(3, 8));
  assert.deepEqual(div(q(1, 30), q(1, 8)), q(4, 15));
  assert.equal(floorDiv(q(19, 8), q(1, 30)), 71);
  assert.equal(ceilDiv(q(19, 8), q(1, 30)), 72);
  assert.equal(ceilDiv(q(1, 30), q(1, 8)), 1);
  assert.deepEqual(fromNumber(0.1), q(1, 10));
  assert.deepEqual(fromNumber(1 / 3), q(1, 3));
  assert.equal(fromNumber(Math.PI / 1e7), null);
  assert.equal(qText(q(19, 8)), "19/8");
  assert.equal(qText(q(2)), "2");
  assert.equal(toNumber(q(12, 5)), 2.4);
  assert.deepEqual(q(2, -4), q(-1, 2));
});
