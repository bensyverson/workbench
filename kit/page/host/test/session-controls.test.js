// @ts-nocheck: page and run objects are generated, which TypeScript cannot follow here.
// The session's Controls (project/2026-11-27-controls-draft.md, "In a composition"; build plan group 52): a Control's
// change is logged with its stamp, the on-screen forms come from the composed Controls and leave out an unwired one,
// and the ui-control probe of reviewer-tests-43, rewritten to the new API, passes: a UI whose Control is not a
// four-direction pad plays (issue Lu11Q1 closes with it: one name, one input).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createSession } from "../session.js";
import { fakeContext, frames } from "../../fixtures/bench.js";
import { synthKit } from "../../fixtures/controls-bench.js";
import { examplePreset } from "../../index.js";
import { defineUI } from "../../../define/index.js";
import { createRun } from "../../../run/index.js";
import { tiny } from "../../../run/test/helpers.js";

/** A loaded workbench, as kit/page/host/load.js gives one, from a kit fixture. @param {any} k */
const loadedOf = (k) => ({ composed: k.composed, runtimes: k.runtimes, packages: k.packages.map((p) => ({ name: p.name, loaded: { ui: p.ui } })), rebuild: null, diagnostics: [] });

test("52a. the session logs a Control's change with its stamp, lists the forms from the composed Controls, and hides an unwired one", () => {
  const k = synthKit();
  const f = frames();
  const s = createSession(loadedOf(k), { context: fakeContext(), requestFrame: f.requestFrame });
  s.page.unlock();
  s.start();
  f.tick(1000); f.tick(1016);
  s.control("tempo", { value: 90 }, { timeStamp: 1020 });
  const [e] = s.page.run.log.inputs.filter((x) => x.kind === "control");
  assert.equal(e.name, "tempo");
  assert.deepEqual(e.value, { value: 90 });
  const [n, d = "1"] = String(e.T).split("/");
  assert.ok(Math.abs(Number(n) / Number(d) - (s.page.run.seconds + 0.004)) < 1e-9, `stamped from the event: ${e.T}`);
  const forms = s.forms();
  assert.deepEqual(forms.map((x) => x.name), ["pads", "notes", "tempo", "wave", "mute", "word"], "spare is unwired, so hidden");
  assert.deepEqual(forms.find((x) => x.name === "pads").buttons, ["hold", "latch"]);
  assert.throws(() => s.control("spare", { value: 1 }), /spare/);
});

test("52b. the ui-control probe (reviewer-tests-43), rewritten: a UI whose Control is not a four-direction pad plays", () => {
  const W = tiny("p", { state: { n: "f64" }, inputs: false, ports: { out: {}, in: { ship: { seam: "Event<{ fire: bool, thrust: bool }>", note: "n" }, steer: { seam: "Event<{ left: bool, right: bool }>", note: "n" } } } }, {
    clock: () => ({ tick: 1 / 4 }), events: { in: { ship: 8, steer: 8 } }, init: () => ({ n: 0 }), step: (s, c) => ({ n: s.n + c.inputs.ship.length + c.inputs.steer.length }),
  });
  const ui = defineUI(W.grammar, { controls: { ship: { kind: "buttons", buttons: ["fire", "thrust"] }, steer: { kind: "buttons", buttons: ["left", "right"] } } });
  const composed = examplePreset("p", () => W.grammar("hero"), {}, { ui }).composition.build({ runtimes: [W.runtime] });
  const run = createRun(composed, { runtimes: [W.runtime] });
  assert.doesNotThrow(() => run.input({ kind: "control", T: 0.1, part: "page", name: "ship", value: { fire: true, thrust: false } }));
  assert.doesNotThrow(() => run.input({ kind: "control", T: 0.2, part: "page", name: "steer", value: { left: true, right: false } }));
  run.runUntil(1);
  assert.equal(run.state("hero").n, 2);
  const s = createSession({ composed, runtimes: [W.runtime], packages: [{ name: "p", loaded: { ui } }], rebuild: null, diagnostics: [] }, { context: fakeContext(), requestFrame: frames().requestFrame });
  assert.doesNotThrow(() => s.control("ship", { fire: true, thrust: true }));
});
