// @ts-nocheck: the fixture Grammar is built at run time, so its builder chains are untyped.
// A part run alone gets the page's controls through Event inputs (Ben's ruling 1, 2026-11-27, which retired
// ctx.controls): examplePreset wires page.out.<control> to the one Event input taking that control's seam, with the page
// wire's fold; two inputs taking one seam (or one input several controls fit) are ambiguous, so none is wired and H009
// says so, naming them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRun } from "../../run/index.js";
import { tiny } from "../../run/test/helpers.js";
import { examplePreset, PAGE_CODES } from "../index.js";

const PAD = "Event<{ up: bool, down: bool, left: bool, right: bool }>";
const HELD = "Event<{ held: bool }>";

/** A part with the Event inputs given (name → seam), counting each one's records. @param {Record<string, string>} ins */
function part(ins, max = 120) {
  const names = Object.keys(ins);
  return tiny("p", { state: Object.fromEntries(names.map((n) => [n, "f64"])), inputs: false, ports: { out: {}, in: Object.fromEntries(names.map((n) => [n, { seam: ins[n], note: "n" }])) } }, {
    clock: () => ({ tick: 1 / 4 }), events: { in: Object.fromEntries(names.map((n) => [n, max])) },
    init: () => Object.fromEntries(names.map((n) => [n, 0])),
    step: (s, c) => Object.fromEntries(names.map((n) => [n, s[n] + c.inputs[n].length])),
  });
}

/** @param {any} W @param {...any} rest */
const preset = (W, ...rest) => examplePreset("p", () => W.grammar("hero"), ...rest);

test("a part with one Event input taking the pad's seam gets page.out.pad wired to it, and a page input reaches it", () => {
  const W = part({ steer: PAD });
  const p = preset(W);
  assert.deepEqual(p.diagnostics, []);
  assert.deepEqual(p.composition.check({ runtimes: [W.runtime] }), []);
  const composed = p.composition.build({ runtimes: [W.runtime] });
  assert.deepEqual(composed.wires.map((w) => [w.from, w.to]), [["page.out.pad", "hero.in.steer"]]);
  const run = createRun(composed, { runtimes: [W.runtime] });
  run.input({ kind: "control", T: 0.1, part: "page", name: "pad", value: { up: false, down: false, left: false, right: true } });
  run.runUntil(1);
  assert.deepEqual(run.diagnostics, []);
  assert.equal(run.state("hero").steer, 1);
});

test("a press burst past the input's max folds, as every page wire does, and never stops the part", () => {
  const W = part({ steer: PAD }, 2);
  const composed = preset(W).composition.build({ runtimes: [W.runtime] });
  const run = createRun(composed, { runtimes: [W.runtime], inputs: Array.from({ length: 9 }, (_, i) => ({ kind: "control", T: 0.01 + i * 0.001, part: "page", name: "pad", value: { up: false, down: false, left: false, right: i % 2 === 0 } })) });
  run.runUntil(1);
  assert.deepEqual(run.diagnostics.map((d) => [d.code, d.severity]), [["N001", "warning"]]);
  assert.equal(run.state("hero").steer, 2);
});

test("a part with no Event input taking a control's seam gets nothing wired, and says nothing", () => {
  const W = part({ other: "Event<{ n: f64 }>" });
  const p = preset(W);
  assert.deepEqual(p.diagnostics, []);
  assert.deepEqual(p.composition.build({ runtimes: [W.runtime] }).wires, []);
});

test("an input that takes only some of a control's fields is not exactly its seam, so it is not wired", () => {
  const W = part({ half: "Event<{ up: bool }>" });
  assert.deepEqual(preset(W).composition.build({ runtimes: [W.runtime] }).wires, []);
});

test("two inputs taking the pad's seam are ambiguous: neither is wired, and H009 names both", () => {
  const W = part({ one: PAD, two: PAD });
  const p = preset(W);
  assert.equal(PAGE_CODES.H009.length > 0, true);
  const h = p.diagnostics.filter((d) => d.code === "H009");
  assert.equal(h.length, 1);
  assert.match(h[0].message, /pad.*one.*two|pad.*two.*one/);
  assert.ok(p.composition, "the example still runs, without the page wired to it");
  assert.deepEqual(p.composition.build({ runtimes: [W.runtime] }).wires, []);
});

test("several controls share one {held} input: ambiguous the other way, none wired, H009 names the controls", () => {
  const W = part({ fire: HELD });
  const p = preset(W);
  const h = p.diagnostics.filter((d) => d.code === "H009");
  assert.equal(h.length, 1);
  assert.match(h[0].message, /fire/);
  assert.match(h[0].message, /a, b, start, select/);
  assert.deepEqual(p.composition.build({ runtimes: [W.runtime] }).wires, []);
});

test("the pad still wires when another input is ambiguous for the buttons", () => {
  const W = part({ steer: PAD, fire: HELD });
  const p = preset(W);
  assert.deepEqual(p.composition.build({ runtimes: [W.runtime] }).wires.map((w) => w.from), ["page.out.pad"]);
  assert.equal(p.diagnostics.filter((d) => d.code === "H009").length, 1);
});

test("wirePage: false (what runTests uses) leaves every input unwired, with no diagnostic", () => {
  const W = part({ one: PAD, two: PAD });
  const p = preset(W, {}, { wirePage: false });
  assert.deepEqual(p.diagnostics, []);
  assert.deepEqual(p.composition.build({ runtimes: [W.runtime] }).wires, []);
});
