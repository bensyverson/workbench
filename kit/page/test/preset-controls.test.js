// @ts-nocheck: the fixture Grammar is built at run time, so its builder chains are untyped.
// A part run alone gets its UI's declared Controls wired by name (declared Controls, 2026-11-27, which retired the
// seam matching of Ben's ruling 1 and its H009): examplePreset wires page.out.<control> to <part>.in.<control> for
// each Control the UI declares on an Event input, with the page wire's fold. Rewritten from the seam-matching tests:
// the three that asserted H009 for two inputs of one seam, one input fitting several controls, and the pad wiring
// beside an ambiguity are gone, since names cannot be ambiguous; the rest are kept, each with a UI.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRun } from "../../run/index.js";
import { tiny } from "../../run/test/helpers.js";
import { defineUI } from "../../define/index.js";
import { examplePreset } from "../index.js";

const PAD = "Event<{ up: bool, down: bool, left: bool, right: bool }>";
const FOUR = { kind: "buttons", buttons: ["up", "down", "left", "right"] };

/** A part with the Event inputs given (name → seam), counting each one's records. @param {Record<string, string>} ins */
function part(ins, max = 120) {
  const names = Object.keys(ins);
  return tiny("p", { state: Object.fromEntries(names.map((n) => [n, "f64"])), inputs: false, ports: { out: {}, in: Object.fromEntries(names.map((n) => [n, { seam: ins[n], note: "n" }])) } }, {
    clock: () => ({ tick: 1 / 4 }), events: { in: Object.fromEntries(names.map((n) => [n, max])) },
    init: () => Object.fromEntries(names.map((n) => [n, 0])),
    step: (s, c) => Object.fromEntries(names.map((n) => [n, s[n] + c.inputs[n].length])),
  });
}

/** @param {any} W @param {Record<string, any>} controls @param {Record<string, unknown>} [o] */
const preset = (W, controls, o = {}) => examplePreset("p", () => W.grammar("hero"), {}, { ui: defineUI(W.grammar, { controls }), ...o });

test("a part whose UI declares a Control on its Event input gets page.out.<control> wired to it, and a page input reaches it", () => {
  const W = part({ steer: PAD });
  const p = preset(W, { steer: FOUR });
  assert.deepEqual(p.diagnostics, []);
  assert.deepEqual(p.composition.check({ runtimes: [W.runtime] }), []);
  const composed = p.composition.build({ runtimes: [W.runtime] });
  assert.deepEqual(composed.wires.map((w) => [w.from, w.to]), [["page.out.steer", "hero.in.steer"]]);
  const run = createRun(composed, { runtimes: [W.runtime] });
  run.input({ kind: "control", T: 0.1, part: "page", name: "steer", value: { up: false, down: false, left: false, right: true } });
  run.runUntil(1);
  assert.deepEqual(run.diagnostics, []);
  assert.equal(run.state("hero").steer, 1);
});

test("a press burst past the input's max folds, as every page wire does, and never stops the part", () => {
  const W = part({ steer: PAD }, 2);
  const composed = preset(W, { steer: FOUR }).composition.build({ runtimes: [W.runtime] });
  const run = createRun(composed, { runtimes: [W.runtime], inputs: Array.from({ length: 9 }, (_, i) => ({ kind: "control", T: 0.01 + i * 0.001, part: "page", name: "steer", value: { up: false, down: false, left: false, right: i % 2 === 0 } })) });
  run.runUntil(1);
  assert.deepEqual(run.diagnostics.map((d) => [d.code, d.severity]), [["N001", "warning"]]);
  assert.equal(run.state("hero").steer, 2);
});

test("a part whose UI declares no Control gets nothing wired, and says nothing", () => {
  const W = part({ other: "Event<{ n: f64 }>" });
  const p = preset(W, {});
  assert.deepEqual(p.diagnostics, []);
  assert.deepEqual(p.composition.build({ runtimes: [W.runtime] }).wires, []);
});

test("two inputs of one seam are two Controls, each wired by its name", () => {
  const W = part({ one: PAD, two: PAD });
  const built = preset(W, { one: FOUR, two: FOUR }).composition.build({ runtimes: [W.runtime] });
  assert.deepEqual(built.wires.map((w) => [w.from, w.to]), [["page.out.one", "hero.in.one"], ["page.out.two", "hero.in.two"]]);
});

test("wirePage: false (what runTests uses) leaves every input unwired, with no diagnostic", () => {
  const W = part({ one: PAD, two: PAD });
  const p = preset(W, { one: FOUR, two: FOUR }, { wirePage: false });
  assert.deepEqual(p.diagnostics, []);
  assert.deepEqual(p.composition.build({ runtimes: [W.runtime] }).wires, []);
});
