// @ts-nocheck: builder chains are generated, which TypeScript cannot see.
// Argument overrides and sites (project/2026-11-27-controls-draft.md, requirement 8; build plan groups 13 to 17 and
// 49a): a Grip or a Control with `to` previews an argument by building with `run(fn, { args })`, the value put in at
// one call before its checks, and commits by finding the call's place with `siteOf(record, target)`. An Argument
// address is the call's Ref id, `:<i>`, then a path. Every builder call has one, a call of literals alone included.
import { test } from "node:test";
import assert from "node:assert/strict";
import { run, siteOf } from "../index.js";
import { callGlue, compose } from "../../compose/index.js";
import { synth, lens } from "../fixtures/controls-dialects.js";

const g = synth();
const chain = ($) => g("s").param("gain", { value: 1, min: 0, max: 2 }).op("a", { ratio: 2, level: 0.5 }).op("b", { ratio: 3, level: 1 }).voices(4).env([[0, 0], [0.5, 1], [1, 0]]);

test("13. run(fn, { args }) overrides a literal, a key in a data object, a list item, a once slot, a name-keyed slot, a repeated instance and a calls construct", () => {
  const at = (/** @type {Record<string, unknown>} */ args, fn = chain) => run(fn, { args }).record;
  const l = lens();
  assert.equal(at({ "b.surface#0:0.radius": 42 }, () => l("b").surface({ radius: 10, gap: 1 })).surface[0].radius, 42, "a key inside a data object");
  assert.equal(at({ "s.op#2:1.ratio": 5 }).ops.b.ratio, 5, "a name-keyed slot");
  assert.deepEqual(at({ "s.env#4:0[1]": [0.25, 0.75] }).env[0][1], [0.25, 0.75], "a list item");
  assert.equal(at({ "s.voices:0": 8 }).voices, 8, "a once slot has no #");
  assert.equal(at({ "s.k#1:0": 7 }, () => g("s").k(1).k(2)).k[1], 7, "a literal argument");
  const voices = () => g("s").voice().gain(0.1).voice().gain(0.2).voice().gain(0.3);
  // unnamed instances go by their construct's name, the second voice~2 (kit/define's Ref ids); a record: "calls" construct numbers in call order
  const r = run(voices, { args: { "voice~2.gain#0:0": 0.9 } });
  assert.equal(r.record.voice[1].calls[0].args[0], 0.9, `a repeated instance name, in a calls construct: ${JSON.stringify(r.diagnostics)}`);
  assert.equal(r.record.voice[0].calls[0].args[0], 0.1, "the first instance is untouched");
});

test("14. an override outside the shape's bounds is B004, with no record", () => {
  const r = run(chain, { args: { "s.op#1:1.ratio": 99 } });
  assert.equal(r.record, null);
  assert.deepEqual(r.diagnostics.map((d) => d.code), ["B004"]);
  assert.match(r.diagnostics[0].message, /above its max, 16/);
});

test("15. an address no call reaches, or a malformed one, is a TypeError naming it", () => {
  assert.throws(() => run(chain, { args: { "s.op#9:1.ratio": 1 } }), (e) => e instanceof TypeError && /s\.op#9:1\.ratio/.test(e.message));
  assert.throws(() => run(chain, { args: { "s.op#1:3": 1 } }), TypeError, "no argument 3");
  assert.throws(() => run(chain, { args: { "not an address": 1 } }), (e) => e instanceof TypeError && /not an address/.test(e.message));
  assert.throws(() => run(chain, { args: [] }), TypeError);
});

test("16. siteOf gives the file, the loc and the shape's bounds for an arg and for a param; an unknown target gives null", () => {
  const record = run(chain).record;
  const arg = siteOf(record, "arg.s.op#1:1.ratio");
  assert.match(arg.file, /arg-overrides\.test\.js$/);
  assert.equal(typeof arg.loc.start.line, "number");
  assert.deepEqual([arg.min, arg.max, arg.whole], [0.25, 16, undefined]);
  assert.deepEqual([siteOf(record, "arg.s.voices:0").min, siteOf(record, "arg.s.voices:0").whole], [1, true]);
  const param = siteOf(record, "param.gain");
  assert.deepEqual([param.min, param.max], [0, 2]);
  assert.equal(param.file, arg.file);
  assert.equal(siteOf(record, "arg.s.op#7:1.ratio"), null);
  assert.equal(siteOf(record, "param.nope"), null);
  assert.equal(siteOf(record, "bogus"), null);
});

test("17. callGlue(exported, path, { args }) builds the glue's part with the override", () => {
  const glue = () => compose("bench").part(g("s").op("a", { ratio: 2, level: 0.5 }));
  const { composition, diagnostics } = callGlue(glue, "workbench.js", { args: { "s.op#0:1.ratio": 4 } });
  assert.deepEqual(diagnostics, []);
  assert.equal(composition.build().parts.find((p) => p.name === "s").record.ops.a.ratio, 4);
  assert.throws(() => callGlue(glue, "workbench.js", { args: { "t.op#0:1.ratio": 4 } }), TypeError, "an address no part reaches");
});

test("49a. every builder call has a Ref id and a site, a call with only literal arguments included", () => {
  const record = run(() => g("s").k(1).k(2).voices(3).voice().gain(0.5)).record;
  // a by-slot record numbers its calls across slots in declaration order (kit/define, "Ref ids"): voices, then k
  const k0 = siteOf(record, "arg.s.k#1:0"), k1 = siteOf(record, "arg.s.k#2:0");
  assert.ok(k0 && k1, "two literal-only calls of one slot");
  assert.notDeepEqual(k0.loc, k1.loc, "each call its own place");
  assert.ok(siteOf(record, "arg.s.voices:0"));
  assert.ok(siteOf(record, "arg.voice.gain#0:0"), "a call in a calls construct");
});
