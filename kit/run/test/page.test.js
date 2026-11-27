// The page part (Ben's ruling 5, 2026-11-26; project/2026-11-26-runtime-contract-plan.md): the page is a built-in
// part whose Event outputs are the controls. A glue wires one like any port; a page input in the log reaches the
// wired part as an Event at its own stamp, recorded and replayed like any input. Massaged for declared Controls
// (2026-11-27): the walker's UI declares its own `pad` (one button, `right`); the page offers what the UIs declare.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRun, replay } from "../index.js";
import { compose, page } from "../../compose/index.js";
import { defineUI, list } from "../../define/index.js";
import { tiny } from "./helpers.js";

/** A walker that takes the D-pad as Events: it keeps each record's right and $T. @param {any} [port] @param {number} [max] */
function walker(port = { seam: "Event<{ right: bool }>", note: "the pad" }, max = 120) {
  const t = tiny("walk", { state: { x: "f64", seen: list("f64", 1000) }, inputs: false, ports: { in: { pad: port } } },
    { clock: () => ({ tick: 1 / 4 }), init: () => ({ x: 0, seen: [] }),
      step: (/** @type {any} */ s, /** @type {any} */ c) => {
        let x = s.x;
        const seen = [...s.seen];
        for (const r of c.inputs.pad) { if (r.right) x += 1; seen.push(r.$T); }
        return { x, seen };
      },
      events: { in: { pad: max } } });
  return { ...t, packages: [{ name: "walk", ui: defineUI(t.grammar, { controls: { pad: { kind: "buttons", buttons: ["right"] } } }) }] };
}

const PRESS = (/** @type {number} */ T, right = true) => ({ kind: "control", T, part: "page", name: "pad", value: { right } });

test("the page offers no Control of its own: its outputs are what the composed parts' UIs declare", () => {
  assert.deepEqual(Object.keys(page.out), []);
  const W = walker(), w = /** @type {any} */ (W.grammar("hero"));
  const built = compose("walk").part(w).wire(page.out.pad, w.in.pad).build({ runtimes: [W.runtime], packages: W.packages });
  assert.deepEqual(Object.keys(/** @type {any} */ (built.parts.find((p) => p.name === "page")).controls), ["pad"]);
});

test("a page control wired to a part reaches it as an Event in a headless run, at its stamp, and replays", () => {
  const W = walker();
  const w = /** @type {any} */ (W.grammar("hero"));
  const glue = compose("walk").part(w).wire(page.out.pad, w.in.pad);
  assert.deepEqual(glue.check({ runtimes: [W.runtime], packages: W.packages }), []);
  const composed = glue.build({ runtimes: [W.runtime], packages: W.packages });
  const run = createRun(composed, { runtimes: [W.runtime], inputs: [PRESS(0.1), PRESS(0.3, false), PRESS(0.6)] });
  run.runUntil(1);
  assert.deepEqual(run.diagnostics, []);
  assert.equal(run.state("hero").x, 2);
  assert.deepEqual(run.state("hero").seen, [0.1, 0.3, 0.6], "each record's $T is its input's stamp");
  assert.equal(replay(composed, { runtimes: [W.runtime] }, JSON.parse(JSON.stringify(run.record()))).ok, true);
  assert.equal(run.log.inputs.filter((e) => e.part === "page").length, 3, "the page inputs are in the log");
});

test("a page input added live is logged and delivered the same as a scripted one", () => {
  const W = walker();
  const w = /** @type {any} */ (W.grammar("hero"));
  const composed = compose("walk").part(w).wire(page.out.pad, w.in.pad).build({ runtimes: [W.runtime], packages: W.packages });
  const run = createRun(composed, { runtimes: [W.runtime] });
  run.runUntil(0.25);
  run.input({ kind: "control", part: "page", name: "pad", value: { right: true } });
  run.runUntil(1);
  assert.equal(run.state("hero").x, 1);
  assert.equal(replay(composed, { runtimes: [W.runtime] }, JSON.parse(JSON.stringify(run.record()))).ok, true);
});

// Rewritten for declared Controls (2026-11-27): a Control that misfits its own part's input is U016 at defineUI now,
// so the seam checks are shown on a page wire into another part's input; the refusals are N013 and N012; and an
// unwired Control is one a UI declares whose input nothing wires (S120 warns of it).
/** A second part with one Event input of `seam`, `east`. @param {string} seam */
const eastward = (seam) => tiny("east", { state: { n: "f64" }, inputs: false, ports: { in: { east: { seam, note: "east" } } } }, { clock: () => ({ tick: 1 / 4 }), init: () => ({ n: 0 }), events: { in: { east: 120 } }, step: (/** @type {any} */ s) => s });

test("a page wire takes the usual seam checks: a field the Control lacks is S202, a rename fixes it", () => {
  const W = walker(), E = eastward("Event<{ east: bool }>");
  const w = /** @type {any} */ (W.grammar("hero")), e = /** @type {any} */ (E.grammar("e"));
  const o = { runtimes: [W.runtime, E.runtime], packages: W.packages };
  assert.deepEqual(compose("walk").part(w).part(e).wire(page.out.pad, w.in.pad).wire(page.out.pad, e.in.east).check(o).map((d) => d.code), ["S202"]);
  assert.deepEqual(compose("walk").part(w).part(e).wire(page.out.pad, w.in.pad).wire(page.out.pad, e.in.east, { rename: { right: "east" } }).check(o), []);
  assert.deepEqual(compose("walk").part(w).wire(page.out.knob, w.in.pad).check().map((d) => d.code), ["S111"], "a Control the page lacks");
});

test("a page input naming no Control is N013, and a value that does not fit it N012", () => {
  const W = walker();
  const w = /** @type {any} */ (W.grammar("hero"));
  const composed = compose("walk").part(w).wire(page.out.pad, w.in.pad).build({ runtimes: [W.runtime], packages: W.packages });
  assert.throws(() => createRun(composed, { runtimes: [W.runtime], inputs: [{ kind: "control", T: 0, part: "page", name: "knob", value: {} }] }), /N013.*'knob'.*its Controls: pad/);
  assert.throws(() => createRun(composed, { runtimes: [W.runtime], inputs: [{ kind: "control", T: 0, part: "page", name: "pad", value: { right: 1 } }] }), /N012.*right.*bool/);
});

test("a declared Control nothing is wired to is logged and goes nowhere", () => {
  const t = tiny("walk", { state: { x: "f64" }, inputs: false, ports: { in: { pad: { seam: "Event<{ right: bool }>", note: "the pad" }, hop: { seam: "Event<{ held: bool }>", note: "a hop" } } } },
    { clock: () => ({ tick: 1 / 4 }), init: () => ({ x: 0 }), events: { in: { pad: 120, hop: 120 } }, step: (/** @type {any} */ s) => s });
  const ui = defineUI(t.grammar, { controls: { pad: { kind: "buttons", buttons: ["right"] }, hop: { kind: "buttons", buttons: ["held"] } } });
  const w = /** @type {any} */ (t.grammar("hero"));
  const composed = compose("walk").part(w).wire(page.out.pad, w.in.pad).build({ runtimes: [t.runtime], packages: [{ name: "walk", ui }] });
  const run = createRun(composed, { runtimes: [t.runtime], inputs: [{ kind: "control", T: 0.1, part: "page", name: "hop", value: { held: true } }] });
  run.runUntil(1);
  assert.deepEqual(run.diagnostics, []);
  assert.equal(run.log.inputs.length, 1);
});

test("a page wire into a consumer whose max is less than the page's bound is S116, which an overflow policy turns into a warning", () => {
  const W = walker(undefined, 1);
  const w = /** @type {any} */ (W.grammar("hero"));
  assert.deepEqual(compose("walk").part(w).wire(page.out.pad, w.in.pad).check({ runtimes: [W.runtime], packages: W.packages }).map((d) => d.code), ["S116"]);
  const ds = compose("walk").part(w).wire(page.out.pad, w.in.pad, { overflow: "keepLast" }).check({ runtimes: [W.runtime], packages: W.packages });
  assert.deepEqual(ds.map((d) => [d.code, d.severity]), [["S116", "warning"]]);
});
