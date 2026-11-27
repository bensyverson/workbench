// @ts-nocheck: UI lambdas name state the Dialect declares, which TypeScript cannot see.
// The stage's pointer, Grips and the new tile components (project/2026-11-27-controls-draft.md, requirements 5, 7
// and 9; build plan groups 6, 7 and 9), on a lens bench: its Draw stage takes the pointer, and its state lists the
// surfaces a Grip drags.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defineUI, DefinitionError, pointerSeam } from "../index.js";
import { lens, synth } from "../fixtures/controls-dialects.js";

/** @param {unknown} decl @param {any} [builder] */
function refused(decl, builder = lens()) {
  try { defineUI(builder, /** @type {any} */ (decl)); return []; } catch (e) {
    assert.ok(e instanceof DefinitionError, String(e));
    return e.diagnostics;
  }
}
const codes = (/** @type {unknown} */ decl, /** @type {any} */ b) => refused(decl, b).map((d) => d.code);

test("6. stage.pointer builds with the pointer seam in the stage's frame; U015, U016 (with the seam to copy) and U014 refuse", () => {
  const ui = defineUI(lens(), { stage: { draw: "view", pointer: "pointer" } });
  assert.equal(ui.stage.pointer, "pointer");
  assert.equal(pointerSeam("px"), "Event<{ phase: 'down' | 'move' | 'up' | 'cancel' | 'wheel' | 'leave', at: point2@px, pointer: f64, buttons: f64, clicks: f64, wheel: vec2, hit: str, shift: bool, alt: bool, meta: bool }>");
  const unknown = refused({ stage: { draw: "view", pointer: "pointr" } });
  assert.deepEqual(unknown.map((d) => d.code), ["U015"]);
  assert.match(unknown[0].message, /Did you mean 'pointer'\?/);
  const thin = refused({ stage: { draw: "view", pointer: "thin" } });
  assert.deepEqual(thin.map((d) => d.code), ["U016"]);
  assert.ok(thin[0].tip.includes(pointerSeam("px")), thin[0].tip);
  assert.deepEqual(codes({ stage: { draw: "view", pointer: "word" } }), ["U016"]);
  assert.deepEqual(codes({ stage: { element: "lens-bench", module: "./lens-bench.js", pointer: "pointer" } }), ["U014"], "a pointer needs a Draw stage");
});

const item = { each: "grips", kind: "length", at: (g) => [g.x, g.y], axis: (g) => [g.dx, g.dy], to: (g) => g.target, label: "radius" };

test("7. Grips build with and without each; U018 refuses each malformed one; at lower, L003 for a misfit at or to", () => {
  const ui = defineUI(lens(), { stage: { draw: "view" }, grips: { radius: item, focus: { kind: "translate", at: (s) => [s.t, 0], to: () => "param.focus" } } });
  assert.deepEqual(Object.keys(ui.grips), ["radius", "focus"]);
  const record = lens()("b").surface({ radius: 10, gap: 1 }).build();
  assert.deepEqual(ui.lower(record).diagnostics, []);
  const g = (/** @type {Record<string, unknown>} */ o, stage = { draw: "view" }) => ({ stage, grips: { g: { ...item, ...o } } });
  const cases = [
    ["no Draw stage", g({}, null)],
    ["each not a state list", g({ each: "t" })],
    ["each naming nothing", g({ each: "grip" })],
    ["an unknown kind", g({ kind: "slide" })],
    ["length without axis", g({ axis: undefined })],
    ["rotate without center", g({ kind: "rotate", axis: undefined })],
    ["scale without center", g({ kind: "scale", axis: undefined })],
    ["an unknown key", g({ min: 0 })],
  ];
  for (const [label, decl] of cases) {
    const d = /** @type {any} */ (decl);
    if (d.grips.g.axis === undefined) delete d.grips.g.axis;
    if (d.stage === null) delete d.stage;
    assert.deepEqual(codes(d), ["U018"], label);
  }
  const lowered = (/** @type {Record<string, unknown>} */ o) => defineUI(lens(), g(o)).lower(record).diagnostics.map((d) => d.code);
  assert.ok(lowered({ at: (g) => g.x }).includes("L003"), "at gives a number, not a point");
  assert.ok(lowered({ to: (g) => g.x }).includes("L003"), "to gives a number, not a str");
});

test("9. components: view (U014 for no Draw output), control and action (U020), param (U020 at lower)", () => {
  const t = (/** @type {Record<string, unknown>} */ c, extra = {}) => ({ stage: { draw: "view" }, ...extra, tiles: { t: { title: "T", place: { tabWith: "stage" }, body: [c] } } });
  const ui = defineUI(lens(), t({ kind: "view", draw: "chart" }));
  assert.equal(ui.tiles.t.body[0].draw, "chart");
  assert.deepEqual(codes(t({ kind: "view", draw: "power" })), ["U014"], "not a Draw output");
  assert.deepEqual(codes(t({ kind: "view", draw: "chrat" })), ["U014"]);
  assert.deepEqual(codes(t({ kind: "view", draw: "chart", pointer: "pointer" })), [], "a view takes the pointer too");
  const controls = { controls: { word: { kind: "text", value: "" } } };
  assert.deepEqual(codes(t({ kind: "control", control: "word" }, controls)), []);
  assert.deepEqual(codes(t({ kind: "control", control: "wrod" }, controls)), ["U020"]);
  assert.deepEqual(codes(t({ kind: "action", action: "export" })), ["U020"]);
  assert.deepEqual(codes(t({ kind: "row", items: [{ kind: "control", control: "word" }, { kind: "param", param: "focus" }] }, controls)), []);
  const withParam = defineUI(synth(), { tiles: { t: { title: "T", place: { splitBelow: "stage" }, body: [{ kind: "param", param: "gain" }, { kind: "param", param: "detune" }] } } });
  const record = synth()("s").param("gain", { value: 1 }).build();
  const ds = withParam.lower(record).diagnostics.filter((d) => d.code === "U020");
  assert.equal(ds.length, 1);
  assert.match(ds[0].message, /detune/);
});
