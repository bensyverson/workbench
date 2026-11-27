// @ts-nocheck: page and run objects are generated, which TypeScript cannot follow here.
// Keys from declarations, wiring by name, blur and the lock (project/2026-11-27-controls-draft.md, requirements 4, 13
// and "A part run alone"; build plan groups 35 to 37, 41, 42 and 49c's order): the page knows no key of its own; each
// Control's `keys` map its codes, a host override replaces them, and the page is locked until one gesture.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as pageKit from "../index.js";
import { examplePreset } from "../index.js";
import { defineUI } from "../../define/index.js";
import { tiny } from "../../run/test/helpers.js";
import { list } from "../../define/index.js";
import { synthPage, logged } from "../fixtures/controls-bench.js";

const unlocked = (o = {}) => { const s = synthPage(o); s.page.unlock(); return s; };
const down = (pg, code) => pg.key({ type: "keydown", code });
const up = (pg, code) => pg.key({ type: "keyup", code });

test("35. keys from declarations: buttons, repeats, triggers, a number, a choice, a toggle, an override, an unwired Control, a focused text", () => {
  const { page: pg } = unlocked();
  assert.equal(down(pg, "KeyH"), true);
  assert.equal(down(pg, "Space"), true, "a second code of a held button is the page's, and sends nothing");
  assert.equal(down(pg, "KeyH"), true, "a repeat sends nothing");
  assert.equal(up(pg, "KeyH"), true, "still held by Space");
  up(pg, "Space");
  down(pg, "KeyS"); up(pg, "KeyS");
  down(pg, "Equal"); down(pg, "Equal"); down(pg, "Equal"); down(pg, "Minus");
  down(pg, "BracketLeft"); down(pg, "BracketRight");
  down(pg, "KeyM"); up(pg, "KeyM"); down(pg, "KeyM");
  assert.deepEqual(logged(pg), [
    ["pads", { hold: true, latch: false }], ["pads", { hold: false, latch: false }],
    ["notes", { index: 61, on: true, velocity: 1 }], ["notes", { index: 61, on: false, velocity: 1 }],
    ["tempo", { value: 170 }], ["tempo", { value: 220 }], ["tempo", { value: 240 }], ["tempo", { value: 190 }],
    ["wave", { value: "sine" }], ["wave", { value: "saw" }],
    ["mute", { value: true }], ["mute", { value: false }],
  ]);
  assert.equal(down(pg, "KeyU"), false, "spare's input is unwired");
  pg.focus("word");
  assert.equal(down(pg, "KeyL"), false, "a focused text Control takes every key");
  pg.focus(null);
  assert.equal(down(pg, "KeyL"), true);
  const o = unlocked({ keys: { KeyQ: "pads.hold" } }).page;
  assert.equal(down(o, "KeyH"), false, "the override replaced hold's codes");
  assert.equal(down(o, "KeyQ"), true);
  assert.deepEqual(logged(o), [["pads", { hold: true, latch: false }]]);
  assert.throws(() => synthPage({ keys: { KeyQ: "pads.push" } }), /pads\.push/);
});

test("36. DEFAULT_KEYS and KEY_TARGETS are not exported", () => {
  assert.equal("DEFAULT_KEYS" in pageKit, false);
  assert.equal("KEY_TARGETS" in pageKit, false);
});

test("37. examplePreset with ui wires every input Control by name, wires nothing without one, and reports no H009", () => {
  const t = tiny("drum", { state: { got: list("f64", 10) }, inputs: false, ports: { in: { hits: { seam: "Event<{ index: f64, on: bool, velocity: f64 }>" }, tempo: { seam: "Event<{ value: f64 }>" } } } },
    { clock: () => ({ tick: 1 / 4 }), events: { in: { hits: 32, tempo: 2 } }, init: () => ({ got: [] }), step: (s) => s });
  const ui = defineUI(t.grammar, { controls: { hits: { kind: "triggers", count: 8 }, tempo: { kind: "number", min: 40, max: 200, value: 90 }, swing: { kind: "number", min: 0, max: 1, value: 0, to: "param.swing" } } });
  const p = examplePreset("drum", () => t.grammar("kit"), {}, { ui });
  const built = p.composition.build({ runtimes: [t.runtime] });
  assert.deepEqual(built.wires.map((w) => [w.from, w.to]), [["page.out.hits", "kit.in.hits"], ["page.out.tempo", "kit.in.tempo"]]);
  assert.deepEqual(p.diagnostics.filter((d) => d.code === "H009"), []);
  assert.deepEqual(examplePreset("drum", () => t.grammar("kit")).composition.build({ runtimes: [t.runtime] }).wires, []);
  assert.deepEqual(examplePreset("drum", () => t.grammar("kit"), {}, { ui, wirePage: false }).composition.build({ runtimes: [t.runtime] }).wires, []);
  assert.equal("H009" in pageKit.PAGE_CODES, false);
});

test("41. a blur releases held buttons and turns held triggers off", () => {
  const { page: pg } = unlocked();
  down(pg, "KeyH"); down(pg, "KeyA"); down(pg, "KeyD");
  pg.blur();
  const after = logged(pg).slice(3);
  assert.deepEqual(after, [["pads", { hold: false, latch: false }], ["notes", { index: 60, on: false, velocity: 1 }], ["notes", { index: 62, on: false, velocity: 1 }]]);
  pg.blur();
  assert.equal(logged(pg).length, 6, "nothing held, nothing sent");
});

test("42. the lock: key-mapped Controls lock the page until one gesture, which calls every hook; no such Control, no lock", async () => {
  const { page: pg, f } = synthPage();
  assert.equal(pg.locked, true);
  assert.equal(down(pg, "KeyH"), false);
  /** @type {string[]} */
  const calls = [];
  pg.onUnlock(() => calls.push("midi"));
  pg.start();
  f.tick(0); f.tick(100);
  assert.equal(pg.run.seconds, 0, "paused at 0 while locked");
  pg.unlock();
  assert.deepEqual(calls, ["midi"]);
  assert.equal(pg.locked, false);
  f.tick(116); f.tick(132);
  assert.ok(pg.run.seconds > 0);
  const free = synthPage({ controls: { word: { kind: "text", value: "" } } }).page;
  assert.equal(free.locked, false);
});

test("42. an unlock hook that throws (a MIDI request refused) is H014: the run still starts, the other hooks run, and the keys play", () => {
  const { page: pg, f } = synthPage();
  const calls = [];
  pg.onUnlock(() => { throw new Error("SecurityError: requestMIDIAccess"); });
  pg.onUnlock(() => calls.push("audio"));
  pg.unlock();
  assert.equal(pg.locked, false);
  assert.equal(pg.driver.paused, false, "the run started");
  assert.deepEqual(calls, ["audio"], "the next hook ran");
  const said = pg.diagnostics.filter((d) => d.code === "H014");
  assert.equal(said.length, 1);
  assert.equal(said[0].severity, "warning");
  assert.match(said[0].message, /requestMIDIAccess/);
  pg.start();
  f.tick(0); f.tick(16);
  assert.ok(pg.run.seconds > 0);
  assert.equal(down(pg, "KeyH"), true, "the keys still play");
});

test("49c. the generated controls view lists the page's Controls in declaration order", () => {
  const { page: pg } = unlocked();
  assert.deepEqual(pg.controls().map((c) => c.name), ["pads", "notes", "tempo", "wave", "mute", "word"]);
  assert.equal(pg.controls()[2].kind, "number");
});
