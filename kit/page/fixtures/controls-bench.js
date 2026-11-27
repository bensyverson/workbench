// Fixtures for declared Controls on the page (project/2026-11-27-controls-draft.md): `synthPage`, a synth whose UI
// declares one Control of each keyed kind, all wired but `spare`; and `lensPage`, a lens bench shown as a layer
// under a part of marks, whose stage takes the pointer and whose surfaces are Grips. Neither is a founding example.
// They live beside test/, since every file under a test/ folder runs as a test.

import { compose, page, layer } from "../../compose/index.js";
import { defineUI, list, struct, data, pointerSeam, run } from "../../define/index.js";
import { tiny } from "../../run/test/helpers.js";
import { createPage } from "../index.js";
import { fakeContext, frames } from "./bench.js";

const NOTES = "Event<{ index: f64, on: bool, velocity: f64 }>";

/** The synth's declared Controls; `spare` has an input that no wire feeds. */
export const SYNTH_CONTROLS = Object.freeze({
  pads: { kind: "buttons", buttons: ["hold", "latch"], keys: { hold: ["KeyH", "Space"], latch: ["KeyL"] } },
  notes: { kind: "triggers", count: 4, first: 60, keys: ["KeyA", "KeyS", "KeyD", "KeyF"] },
  tempo: { kind: "number", min: 40, max: 240, value: 120, step: 50, keys: { down: ["Minus"], up: ["Equal"] } },
  wave: { kind: "choice", options: ["sine", "saw", "square"], value: "sine", keys: { prev: ["BracketLeft"], next: ["BracketRight"] } },
  mute: { kind: "toggle", value: false, keys: ["KeyM"] },
  word: { kind: "text", value: "" },
  spare: { kind: "number", min: 0, max: 1, value: 0, keys: { up: ["KeyU"], down: ["KeyJ"] } },
});

/** The synth part, its UI and a composition wiring every Control but `spare`. @param {Record<string, any>} [controls] */
export function synthKit(controls = SYNTH_CONTROLS) {
  const t = tiny("synth", {
    state: { n: "f64" }, inputs: false,
    ports: { in: {
      pads: { seam: "Event<{ hold: bool, latch: bool }>" }, notes: { seam: NOTES }, tempo: { seam: "Event<{ value: f64 }>" },
      wave: { seam: "Event<{ value: 'sine' | 'saw' | 'square' }>" }, mute: { seam: "Event<{ value: bool }>" }, word: { seam: "Event<{ value: str }>" }, spare: { seam: "Event<{ value: f64 }>" },
    } },
  }, { clock: () => ({ frame: true }), init: () => ({ n: 0 }), step: (/** @type {any} */ s) => s, events: { in: { pads: 4, notes: 64, tempo: 4, wave: 4, mute: 4, word: 4, spare: 4 } } });
  const ui = defineUI(t.grammar, { controls });
  const p = /** @type {any} */ (t.grammar("fm"));
  let c = compose("play").part(p);
  for (const n of Object.keys(controls)) if (n !== "spare") c = c.wire(/** @type {any} */ (page.out)[n], p.in[n]);
  const packages = [{ name: "synth", ui }];
  const composed = c.build({ runtimes: [t.runtime], packages });
  return { ...t, ui, packages, composed, runtimes: [t.runtime] };
}

/** A page on the synth. @param {Record<string, any>} [o]  more createPage options */
export function synthPage(o = {}) {
  const k = synthKit(o.controls);
  const f = frames();
  const pg = createPage({ composed: k.composed, runtimes: k.runtimes, packages: k.packages, context: fakeContext(), requestFrame: f.requestFrame, ...(o.keys ? { keys: o.keys } : {}) });
  return { page: pg, f, kit: k };
}

/** The control inputs a page logged, as [name, value]. @param {any} pg */
export const logged = (pg, kind = "control") => pg.run.log.inputs.filter((/** @type {any} */ e) => e.kind === kind).map((/** @type {any} */ e) => (kind === "control" ? [e.name, e.value] : e));

const BOARD_VIEW = () => [{ op: "rect", at: [0, 0], size: [100, 100], fill: "#000000", id: "bg" }];
const MARKS_VIEW = () => [{ op: "rect", at: [2, 2], size: [2, 2], fill: "#ffffff", id: "m1" }];

/**
 * The lens bench: `board` (px, 100 by 100, the pointer, Grips on its surfaces) under `marks` (cell, ten px a cell),
 * shown as the layer `top`. `marksPointer` gives marks a pointer input too; `keyed` gives the board a key-mapped zoom
 * Control, wired, so the page starts locked.
 * @param {{ marksPointer?: boolean, keyed?: boolean, grips?: Record<string, any> }} [o]
 */
export function lensKit(o = {}) {
  const board = tiny("lens", {
    state: { t: "f64", grips: list(struct({ x: "f64", y: "f64", dx: "f64", dy: "f64", target: "str" }), 4), got: list("str", 200) }, inputs: false,
    frames: { px: { dims: 2, note: "pixels", extent: () => ({ min: [0, 0], max: [100, 100] }) } },
    ports: { in: { pointer: { seam: pointerSeam("px") }, zoom: { seam: "Event<{ value: f64 }>" } }, out: { view: { seam: "Draw<4>@px", from: BOARD_VIEW } } },
    slots: { surface: { kind: "decl", args: [data({ radius: data("number", { min: 0, max: 40 }) })] } },
  }, {
    clock: () => ({ tick: 1 / 60 }), events: { in: { pointer: 16, zoom: 4 } },
    init: () => ({ t: 0, got: [], grips: [{ x: 50, y: 50, dx: 1, dy: 0, target: "arg.b.surface#0:0.radius" }, { x: 20, y: 20, dx: 0, dy: 1, target: "arg.b.surface#9:0.radius" }] }),
    step: (/** @type {any} */ s, /** @type {any} */ c) => ({ ...s, got: [...s.got, ...c.inputs.pointer.map((/** @type {any} */ r) => `${r.phase}@${r.at[0]},${r.at[1]}:${r.hit}`)] }),
  });
  const marks = tiny("marks", {
    state: { got: list("str", 200) }, inputs: false,
    frames: { cell: { dims: 2, note: "cells", extent: () => ({ min: [0, 0], max: [10, 10] }) } },
    ports: { in: o.marksPointer ? { pointer: { seam: pointerSeam("cell") } } : {}, out: { view: { seam: "Draw<4>@cell", from: MARKS_VIEW } } },
  }, { clock: () => ({ tick: 1 / 60 }), ...(o.marksPointer ? { events: { in: { pointer: 16 } } } : {}), init: () => ({ got: [] }), step: (/** @type {any} */ s, /** @type {any} */ c) => ({ got: [...s.got, ...(c.inputs.pointer ?? []).map((/** @type {any} */ r) => `${r.phase}@${r.at[0]},${r.at[1]}:${r.hit}`)] }) });
  const boardUI = defineUI(board.grammar, {
    stage: { draw: "view", pointer: "pointer" },
    ...(o.keyed ? { controls: { zoom: { kind: "number", min: 1, max: 4, value: 1, keys: { up: ["Equal"], down: ["Minus"] } } } } : {}),
    grips: o.grips ?? {
      radius: { each: "grips", kind: "length", at: (/** @type {any} */ g) => [g.x, g.y], axis: (/** @type {any} */ g) => [g.dx, g.dy], to: (/** @type {any} */ g) => g.target, label: "radius" },
    },
  });
  const marksUI = defineUI(marks.grammar, o.marksPointer ? { stage: { draw: "view", pointer: "pointer" } } : {});
  // the board's calls are numbered across its slots in declaration order (kit/define's Ref ids): param, then surface
  const program = () => /** @type {any} */ (board.grammar("b")).param("focus", { value: 5 }).surface({ radius: 10 });
  const b = program(), m = /** @type {any} */ (marks.grammar("m"));
  const top = layer("top", b.out.view, m.out.view);
  let c = compose("bench").part(b).part(m).part(top).frame(m.frame.cell, b.frame.px, { scale: 10, offset: 0 }).show(top);
  if (o.keyed) c = c.wire(/** @type {any} */ (page.out).zoom, b.in.zoom);
  const packages = [{ name: "lens", ui: boardUI }, { name: "marks", ui: marksUI }];
  const runtimes = [board.runtime, marks.runtime];
  const composed = c.build({ runtimes, packages });
  // the board's record is run's, so a rebuild with an argument's override builds the same Program
  const built = run(program).record;
  composed.parts = composed.parts.map((/** @type {any} */ p) => (p.name === "b" ? { ...p, record: built } : p));
  /** @param {string} _part @param {Record<string, unknown>} values @param {{ args?: Record<string, unknown> }} [more] */
  const build = (_part, values, more = {}) => /** @type {any} */ (run(program, { values, ...(more.args ? { args: more.args } : {}) })).record;
  return { board, marks, packages, runtimes, composed, build, program };
}

/** A page on the lens bench. @param {Record<string, any>} [o] */
export function lensPage(o = {}) {
  const k = lensKit(o);
  const f = frames();
  const pg = createPage({ composed: k.composed, runtimes: k.runtimes, packages: k.packages, context: fakeContext(), requestFrame: f.requestFrame, run: { build: k.build } });
  return { page: pg, f, kit: k };
}
