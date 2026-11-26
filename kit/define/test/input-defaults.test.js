// An Event input's field default (Ben's ruling 4, 2026-11-26): `<field>: <type> = <value>` in the input's record.
// defineDialect keeps it and judges it (D028): it must fit its field's type, and only a top-level field of an Event
// input's record may take one (an output's record and a value input's are what they are; a nested record's field has
// no producer record of its own to be missing from).
import { test } from "node:test";
import assert from "node:assert/strict";
import { defineDialect, DefinitionError } from "../index.js";
import { particlesDecl, mazeDecl } from "../fixtures/seams-dialects.js";

/** @param {() => Record<string, any>} make @param {(d: Record<string, any>) => void} change @returns {any[]} */
function refused(make, change) {
  const d = make();
  change(d);
  try { defineDialect(/** @type {any} */ (d)); } catch (e) {
    assert.ok(e instanceof DefinitionError, String(e));
    return /** @type {any} */ (e).diagnostics;
  }
  return [];
}
/** @param {any[]} ds */
const codes = (ds) => ds.map((x) => x.code);

test("an Event input's record field may take a default: the Dialect keeps it, and the record's lambdas read the field", () => {
  const d = particlesDecl();
  d.ports.in.burst.seam = "Event<{ at: point2@px, speed: f64 = 40 }>";
  const p = /** @type {any} */ (defineDialect(/** @type {any} */ (d)));
  assert.deepEqual(p.seams.in.burst.seam.of.defaults, { speed: 40 });
  assert.equal(p.seams.in.burst.seamText, "Event<{ at: point2@px, speed: f64 = 40 }>");
  const env = p.environment({});
  assert.deepEqual(Object.keys(env.objects[env.globals.ev.obj].members), ["at", "speed"]);
});

test("D028: a default that does not fit its field's type", () => {
  const ds = refused(particlesDecl, (d) => { d.ports.in.burst.seam = "Event<{ at: point2@px, speed: f64 = 'fast' }>"; });
  assert.deepEqual(codes(ds), ["D028"]);
  assert.match(ds[0].message, /speed/);
  assert.deepEqual(ds[0].path, ["ports", "in", "burst", "seam"]);
  assert.deepEqual(codes(refused(particlesDecl, (d) => { d.ports.in.burst.seam = "Event<{ at: point2@px = [1] }>"; })), ["D028"], "a vector default needs its components");
});

test("D028: a default anywhere but a top-level field of an Event input's record", () => {
  assert.deepEqual(codes(refused(mazeDecl, (d) => { d.ports.out.picked.seam = "Event<{ at: point2@cell, n: f64 = 1 }>"; })), ["D028"], "an output");
  assert.deepEqual(codes(refused(particlesDecl, (d) => { d.ports.in.burst.seam = "Event<{ at: point2@px, m: { a: f64 = 1 } }>"; })), ["D028"], "a nested record");
  assert.deepEqual(codes(refused(particlesDecl, (d) => { d.ports.in.radius = { seam: "{ r: f64 = 1 }", default: { r: 1 } }; })), ["D028"], "a value input");
});

test("D028: a record-typed field takes no default, and the tip says so instead of offering a literal the seam grammar cannot read", () => {
  const ds = refused(particlesDecl, (d) => { d.ports.in.burst.seam = "Event<{ at: point2@px, a: { x: f64 } = 1 }>"; });
  assert.deepEqual(codes(ds), ["D028"]);
  assert.match(ds[0].tip, /record-typed field takes no default/);
  assert.doesNotMatch(ds[0].tip, /\{ x: 0 \}/);
  // a scalar still gets a sample that fits
  const sc = refused(particlesDecl, (d) => { d.ports.in.burst.seam = "Event<{ at: point2@px, a: str = 1 }>"; });
  assert.match(sc[0].tip, /a: str = ""/);
});
