// A record field's default (Ben's ruling 4, 2026-11-26): `<field>: <type> = <value>` in a seam record. A producer
// whose record lacks a defaulted field still feeds the consumer: the comparison lists the field to fill with its
// value, and a field with no default is still S202.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSeam, printSeam, compareSeams } from "../index.js";

/** @param {string} s */
const parse = (s) => { const r = parseSeam(s); if (!r.ok) throw new Error(r.error); return r.type; };

test("a record field may declare a default: a number, a bool, a string, a vector; each prints back", () => {
  const t = /** @type {any} */ (parse("Event<{ at: point2@px, speed: f64 = 40, slow: f64 = -0.5, big: f64 = 1.5e3, on: bool = true, tag: str = 'pop', mode: 'a' | 'b' = 'b', push: vec2@px = [0, -1] }>"));
  assert.equal(t.kind, "event");
  assert.deepEqual(t.of.defaults, { speed: 40, slow: -0.5, big: 1500, on: true, tag: "pop", mode: "b", push: [0, -1] });
  assert.equal(t.of.fields.speed.kind, "scalar");
  assert.equal(printSeam(t), "Event<{ at: point2@px, speed: f64 = 40, slow: f64 = -0.5, big: f64 = 1500, on: bool = true, tag: str = 'pop', mode: 'a' | 'b' = 'b', push: vec2@px = [0, -1] }>");
  assert.deepEqual(parse(printSeam(t)), t, "the printed form parses to the same seam");
  assert.equal("defaults" in /** @type {any} */ (parse("{ a: f64 }")), false, "a record with no default has no defaults");
});

test("a default that does not parse, or names no value, is a syntax error", () => {
  for (const s of ["{ a: f64 = }", "{ a: f64 = nope }", "{ a: f64 = [1, }", "{ a: f64 = 1 = 2 }", "{ a: f64 = { b: 1 } }"]) {
    assert.equal(parseSeam(s).ok, false, s);
  }
  assert.match(/** @type {any} */ (parseSeam("{ a: f64 = nope }")).error, /default/);
});

test("compareSeams: a field the producer lacks and the consumer defaults is filled, not S202; one with no default is still S202", () => {
  const from = parse("Event<{ at: point2@cell }>");
  const r = compareSeams(from, parse("Event<{ at: point2@px, speed: f64 = 40 }>"));
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.filled, { speed: 40 });
  const missing = compareSeams(from, parse("Event<{ at: point2@px, speed: f64 }>"));
  assert.deepEqual(missing.problems.map((p) => p.code), ["S202"]);
  assert.deepEqual(missing.filled, {});
  const has = compareSeams(parse("Event<{ at: point2@cell, speed: f64 }>"), parse("Event<{ at: point2@px, speed: f64 = 40 }>"));
  assert.deepEqual(has.filled, {}, "a producer that has the field gives its own value");
  const wrong = compareSeams(parse("Event<{ at: point2@cell, speed: str }>"), parse("Event<{ at: point2@px, speed: f64 = 40 }>"));
  assert.deepEqual(wrong.problems.map((p) => p.code), ["S202"], "a producer's field of another kind is not saved by the default");
});
