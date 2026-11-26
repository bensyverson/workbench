// The page part (Ben's ruling 5, 2026-11-26; project/2026-11-26-runtime-contract-plan.md): the page is a built-in
// part whose Event outputs are the controls. A glue wires one like any port; a page input in the log reaches the
// wired part as an Event at its own stamp, recorded and replayed like any input.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRun, replay } from "../index.js";
import { compose, page, PAGE_CONTROLS } from "../../compose/index.js";
import { list } from "../../define/index.js";
import { tiny } from "./helpers.js";

/** A walker that takes the D-pad as Events: it keeps each record's right and $T. @param {any} [port] @param {number} [max] */
function walker(port = { seam: "Event<{ right: bool }>", note: "the pad" }, max = 64) {
  return tiny("walk", { state: { x: "f64", seen: list("f64", 1000) }, inputs: false, ports: { in: { pad: port } } },
    { clock: () => ({ tick: 1 / 4 }), init: () => ({ x: 0, seen: [] }),
      step: (/** @type {any} */ s, /** @type {any} */ c) => {
        let x = s.x;
        const seen = [...s.seen];
        for (const r of c.inputs.pad) { if (r.right) x += 1; seen.push(r.$T); }
        return { x, seen };
      },
      events: { in: { pad: max } } });
}

const PRESS = (/** @type {number} */ T, right = true) => ({ kind: "control", T, part: "page", name: "pad", value: { up: false, down: false, left: false, right } });

test("the page offers the D-pad and the DMG host's buttons as Event outputs", () => {
  assert.deepEqual(Object.keys(PAGE_CONTROLS), ["pad", "a", "b", "start", "select"]);
  assert.deepEqual(Object.keys(page.out).sort(), ["a", "b", "pad", "select", "start"]);
});

test("a page control wired to a part reaches it as an Event in a headless run, at its stamp, and replays", () => {
  const W = walker();
  const w = /** @type {any} */ (W.grammar("hero"));
  const glue = compose("walk").part(w).wire(page.out.pad, w.in.pad);
  assert.deepEqual(glue.check({ runtimes: [W.runtime] }), []);
  const composed = glue.build({ runtimes: [W.runtime] });
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
  const composed = compose("walk").part(w).wire(page.out.pad, w.in.pad).build({ runtimes: [W.runtime] });
  const run = createRun(composed, { runtimes: [W.runtime] });
  run.runUntil(0.25);
  run.input({ kind: "control", part: "page", name: "pad", value: { up: false, down: false, left: false, right: true } });
  run.runUntil(1);
  assert.equal(run.state("hero").x, 1);
  assert.equal(replay(composed, { runtimes: [W.runtime] }, JSON.parse(JSON.stringify(run.record()))).ok, true);
});

test("a page wire takes the usual seam checks: a field the page lacks is S202, a rename fixes it", () => {
  const W = walker({ seam: "Event<{ east: bool }>", note: "the pad" });
  const w = /** @type {any} */ (W.grammar("hero"));
  assert.deepEqual(compose("walk").part(w).wire(page.out.pad, w.in.pad).check({ runtimes: [W.runtime] }).map((d) => d.code), ["S202"]);
  const glue = compose("walk").part(w).wire(page.out.pad, w.in.pad, { rename: { right: "east" } });
  assert.deepEqual(glue.check({ runtimes: [W.runtime] }), []);
  assert.deepEqual(compose("walk").part(w).wire(page.out.knob, w.in.pad).check().map((d) => d.code), ["S111"], "a control the page lacks");
});

test("a page input naming no control, or a value that does not fit it, is refused", () => {
  const W = walker();
  const w = /** @type {any} */ (W.grammar("hero"));
  const composed = compose("walk").part(w).wire(page.out.pad, w.in.pad).build({ runtimes: [W.runtime] });
  assert.throws(() => createRun(composed, { runtimes: [W.runtime], inputs: [{ kind: "control", T: 0, part: "page", name: "knob", value: {} }] }), /page has no control 'knob'.*pad, a, b, start, select/);
  assert.throws(() => createRun(composed, { runtimes: [W.runtime], inputs: [{ kind: "control", T: 0, part: "page", name: "a", value: { held: 1 } }] }), /held.*bool/);
});

test("a page control nothing is wired to is logged and goes nowhere", () => {
  const W = walker();
  const w = /** @type {any} */ (W.grammar("hero"));
  const composed = compose("walk").part(w).wire(page.out.pad, w.in.pad).build({ runtimes: [W.runtime] });
  const run = createRun(composed, { runtimes: [W.runtime], inputs: [{ kind: "control", T: 0.1, part: "page", name: "a", value: { held: true } }] });
  run.runUntil(1);
  assert.deepEqual(run.diagnostics, []);
  assert.equal(run.log.inputs.length, 1);
});

test("a page wire into a consumer whose max is less than the page's bound is S116, which an overflow policy turns into a warning", () => {
  const W = walker(undefined, 1);
  const w = /** @type {any} */ (W.grammar("hero"));
  assert.deepEqual(compose("walk").part(w).wire(page.out.pad, w.in.pad).check({ runtimes: [W.runtime] }).map((d) => d.code), ["S116"]);
  const ds = compose("walk").part(w).wire(page.out.pad, w.in.pad, { overflow: "keepLast" }).check({ runtimes: [W.runtime] });
  assert.deepEqual(ds.map((d) => [d.code, d.severity]), [["S116", "warning"]]);
});
