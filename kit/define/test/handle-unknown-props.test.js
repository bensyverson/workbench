// A handle names a port or a frame; reading a property it does not define (`a.out.x.y`) is a mistake that would
// otherwise give undefined silently, so it throws S301. What the kit and the runtimes probe keeps working.
import { test } from "node:test";
import assert from "node:assert/strict";
import { inspect } from "node:util";
import { maze, GRID } from "../fixtures/seams-dialects.js";

const steer = "(pl, pad) => { pl.dx = pad.left ? -1 : 0; }";
const level = () => /** @type {any} */ (maze()("level").grid(GRID).control(steer));

test("reading a property a handle does not define throws S301, however it was reached", () => {
  const l = level();
  for (const f of [() => l.out.picked.y, () => l.out?.picked?.y, () => l.out.nope.y, () => l.in.nope.deep, () => l.frame.cell.y]) {
    assert.throws(f, (/** @type {any} */ e) => e.code === "S301" && /read as a value|not a value|does not define/.test(e.message) && /\.y|\.deep/.test(e.message));
  }
});

test("the properties the kit reads, and what runtimes probe, still work on a handle", () => {
  const l = level();
  const h = l.out.picked;
  for (const k of ["program", "part", "dialect", "side", "name", "known", "seam", "dims"]) assert.doesNotThrow(() => h[k], k);
  assert.equal(l.frame.cell.seam, undefined);
  assert.equal(h.then, undefined);
  assert.equal(h.toJSON(), "[handle level.out.picked]");
  assert.equal(h.toString(), "[handle level.out.picked]");
  assert.equal(JSON.stringify({ h }), '{"h":"[handle level.out.picked]"}');
  assert.equal(h[Symbol.toStringTag], undefined);
  assert.ok(typeof inspect(h) === "string");
  assert.doesNotThrow(() => console.log === undefined || inspect(h, { depth: 4, showHidden: true }));
  assert.equal(h.constructor, Object);
  assert.equal(typeof h.hasOwnProperty, "function");
  assert.equal(Object.keys(h).includes("name"), true);
  assert.equal(h.known, true);
  assert.equal(l.out.nope.known, false);
});

test("a handle still deep-equals itself and a handle's printed form is stable", () => {
  const l = level();
  assert.deepEqual(l.out.picked, l.out.picked);
  assert.deepEqual({ a: l.out.picked }, { a: l.out.picked });
  assert.notDeepEqual(l.out.picked, l.out.player);
});
