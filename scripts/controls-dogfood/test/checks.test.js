import { test } from "node:test";
import assert from "node:assert/strict";
import { checkGlue, checkHandIn, seamFields } from "../checks.js";

const ports = {
  in: {
    dirs: { seam: "Event<{ up: bool, down: bool }>", note: "held" },
    notes: { seam: "Event<{ index: f64, on: bool }>", note: "notes" },
    pointer: { seam: "Event<{ phase: 'down' | 'move' | 'up' | 'cancel' | 'wheel' | 'leave', at: point2@frame, pointer: f64, buttons: f64, clicks: f64, wheel: vec2, hit: str, shift: bool, alt: bool, meta: bool }>", note: "p" },
    knob: { seam: "Event<{ key: str, value: f64 }>", note: "k" },
  },
  out: { board: { seam: "Draw", note: "" } },
};
const good = () => ({
  ports: structuredClone(ports),
  ui: {
    stage: { draw: "board", pointer: "pointer" },
    controls: {
      dirs: { kind: "buttons", buttons: ["up", "down"], grid: [["up"], ["down"]], keys: { up: ["ArrowUp"] } },
      notes: { kind: "triggers", count: 12, keys: ["KeyA"], latency: "direct" },
      knob: { kind: "number", min: 1, max: 8, value: 2, curve: "log", each: (/** @type {any} */ r) => r.ops.map((/** @type {any} */ o) => ({ key: o, to: `arg.${o}.operator:1.ratio` })) },
    },
    grips: { g: { kind: "length", at: () => [1, 2], axis: () => [1, 0], to: () => "arg.a.b:0.c" } },
    tiles: { t: { place: { tabWith: "stage" }, body: [{ kind: "control", control: "dirs" }] } },
  },
  sample: { ops: ["mod", "car"] },
  gripItem: {},
});

/** @param {(h: any) => void} mutate @returns {string[]} */
const codes = (mutate) => { const h = good(); mutate(h); return checkHandIn(h).map((p) => p.code); };

test("a good hand-in has no problems", () => assert.deepEqual(checkHandIn(good()), []));
test("seamFields splits at top-level commas", () => assert.deepEqual(seamFields("Event<{ a: list<vec2, 8>, b: 'x' | 'y' }>"), { a: "list<vec2, 8>", b: "'x' | 'y'" }));
test("U015: a name that is no input", () => assert.ok(codes((h) => { h.ui.controls.nope = { kind: "toggle", value: true }; }).includes("U015")));
test("U015 is waived by `to`", () => assert.deepEqual(codes((h) => { h.ui.controls.nope = { kind: "toggle", value: true, to: "param.x" }; }), []));
test("U016: a missing field and a wrong type", () => {
  assert.ok(codes((h) => { h.ui.controls.dirs.buttons = ["up"]; delete h.ui.controls.dirs.grid; }).includes("U016"));
  assert.ok(codes((h) => { h.ports.in.notes.seam = "Event<{ index: f64, on: str }>"; }).includes("U016"));
});
test("U016: a keyed Control needs key in the input", () => assert.ok(codes((h) => { h.ports.in.knob.seam = "Event<{ value: f64 }>"; }).includes("U016")));
test("U016: a keyed input with no each", () => assert.ok(codes((h) => { delete h.ui.controls.knob.each; }).includes("U016")));
test("U017 cases", () => {
  assert.ok(codes((h) => { h.ui.controls.knob.kind = "dial"; }).includes("U017"));
  assert.ok(codes((h) => { h.ui.controls.knob.min = 9; }).includes("U017"));
  assert.ok(codes((h) => { h.ui.controls.knob.min = 0; }).includes("U017"));
  assert.ok(codes((h) => { h.ui.controls.notes.latency = "audio"; }).includes("U017"));
  assert.ok(codes((h) => { h.ui.controls.notes.keys = ["a"]; }).includes("U017"));
  assert.ok(codes((h) => { h.ui.controls.dirs.grid = [["up", "up"]]; }).includes("U017"));
  assert.ok(codes((h) => { h.ui.controls.knob.extra = 1; }).includes("U017"));
});
test("each: a repeated key and a target no call reaches", () => {
  assert.ok(codes((h) => { h.sample = { ops: ["mod", "mod"] }; }).includes("U017"));
  assert.ok(codes((h) => { h.validTargets = ["arg.mod.operator:1.ratio"]; }).includes("H011"));
});
test("U014 and U018", () => {
  assert.ok(codes((h) => { h.ui.stage.draw = "nope"; }).includes("U014"));
  assert.ok(codes((h) => { delete h.ui.grips.g.axis; }).includes("U018"));
  assert.ok(codes((h) => { delete h.ui.stage; }).includes("U018"));
});
test("U016: the pointer seam must carry every field the kit sends it", () => assert.ok(codes((h) => { h.ports.in.pointer.seam = "Event<{ phase: str, nope: f64 }>"; }).includes("U016")));
test("U020 and U003", () => {
  assert.ok(codes((h) => { h.ui.tiles.t.body = [{ kind: "control", control: "zzz" }]; }).includes("U020"));
  assert.ok(codes((h) => { h.ui.tiles.t.place = { splitBelow: "pad" }; }).includes("U003"));
});
test("U001: the retired keys", () => assert.ok(codes((h) => { h.ui.inputs = {}; }).includes("U001")));
test("glue: wiring by name, and what is left unwired", () => {
  const ok = checkGlue(".wire(page.out.dirs, game.in.dirs)", { controls: ["dirs"] });
  assert.deepEqual(ok, []);
  assert.equal(checkGlue(".wire(page.out.dirs, game.in.move)", { controls: ["dirs"] })[0]?.code, "S2xx");
  assert.equal(checkGlue(".wire(page.out.zzz, game.in.zzz)", { controls: ["dirs"] })[0]?.code, "S111");
  assert.ok(checkGlue("", { controls: ["dirs"] }).some((p) => p.code === "S120"));
});
test("a part-local each Control takes its `to` per entry", () => {
  assert.deepEqual(codes((h) => { h.ui.controls.local = { kind: "number", min: 0, max: 1, value: 0, each: (/** @type {any} */ r) => r.ops.map((/** @type {any} */ o) => ({ key: o, to: `arg.${o}.operator:1.x` })) }; }), []);
  assert.ok(codes((h) => { h.ui.controls.local = { kind: "number", min: 0, max: 1, value: 0, each: (/** @type {any} */ r) => r.ops.map((/** @type {any} */ o) => ({ key: o })) }; }).includes("U015"));
});
test("a tile needs a body and one direction", () => {
  assert.ok(codes((h) => { h.ui.tiles.t = [{ kind: "control", control: "dirs" }]; }).includes("U014"));
  assert.ok(codes((h) => { h.ui.tiles.t.place = { splitBelow: "stage", tabWith: "stage" }; }).includes("U003"));
});
