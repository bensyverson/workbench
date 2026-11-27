// @ts-nocheck: declarations are plain data and lambdas the kit reads, which TypeScript cannot follow.
// Declared Controls (project/2026-11-27-controls-draft.md, requirements 1 to 3 and the kind table; build plan groups
// 1 to 5 and 10 to 12): a package's UI declares each Control by the name of the Dialect's Event input it plays, of a
// kind from the kit's closed list, checked against that input's seam. The Dialect is an FM synth's (notes from
// triggers, keyed operator knobs, an envelope), not a founding example.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defineUI, DefinitionError, UI_CODES, CONTROL_KINDS } from "../index.js";
import * as define from "../index.js";
import { synth } from "../fixtures/controls-dialects.js";

/** @param {unknown} decl @param {any} [builder] */
function refused(decl, builder = synth()) {
  try { defineUI(builder, /** @type {any} */ (decl)); return []; } catch (e) {
    assert.ok(e instanceof DefinitionError, String(e));
    assert.ok(e.diagnostics.every((d) => d.tip.length > 0), "every diagnostic has a tip");
    return e.diagnostics;
  }
}
/** @param {unknown} decl */
const codes = (decl) => refused(decl).map((d) => d.code);
/** One Control, `name`, declared. @param {string} name @param {Record<string, unknown>} c */
const one = (name, c) => ({ controls: { [name]: c } });

/** Each kind, on the synth input whose seam it fits, with its class and default perFrame. */
const EACH_KIND = [
  ["pads", { kind: "buttons", buttons: ["hold", "latch"] }, "Event<{ hold: bool, latch: bool }>", "state", 2],
  ["mute", { kind: "toggle", value: false }, "Event<{ value: bool }>", "state", 1],
  ["volume", { kind: "number", min: 0, max: 1, value: 0.5 }, "Event<{ value: f64 }>", "state", 1],
  ["pan", { kind: "vector", dims: 2, min: -1, max: 1, value: [0, 0] }, "Event<{ value: vec2 }>", "state", 1],
  ["tint", { kind: "color", value: [1, 0.5, 0] }, "Event<{ value: vec3 }>", "state", 1],
  ["wave", { kind: "choice", options: ["sine", "saw", "square"], value: "sine" }, "Event<{ value: 'sine' | 'saw' | 'square' }>", "state", 1],
  ["word", { kind: "text", value: "hi" }, "Event<{ value: str }>", "state", 1],
  ["glass", { kind: "pick", file: "glasses", key: "name", carry: { nd: "f64" }, value: "BK7" }, "Event<{ value: str, nd: f64 }>", "state", 1],
  ["shape", { kind: "points", max: 8, x: [0, 1], y: [0, 1], value: [[0, 0], [1, 1]] }, "Event<{ value: list<vec2, 8> }>", "state", 1],
  ["notes", { kind: "triggers", count: 25, first: 48 }, "Event<{ index: f64, on: bool, velocity: f64 }>", "delta", 32],
];

test("1. each kind of the table, on an input whose seam fits, builds with its kind, seam, class and perFrame", () => {
  assert.deepEqual([...CONTROL_KINDS].sort(), ["buttons", "choice", "color", "number", "pick", "points", "text", "toggle", "triggers", "vector"]);
  for (const [name, c, seam, records, perFrame] of EACH_KIND) {
    const ui = defineUI(synth(), one(name, c));
    const got = ui.controls[name];
    assert.equal(got.kind, c.kind, name);
    assert.equal(got.seam, seam, name);
    assert.equal(got.records, records, name);
    assert.equal(got.perFrame, perFrame, name);
    assert.equal(got.input, name, name);
  }
  assert.equal(defineUI(synth(), one("notes", { kind: "triggers", count: 4, perFrame: 64 })).controls.notes.perFrame, 64, "a raised perFrame is kept");
  assert.equal(defineUI(synth(), one("notes", { kind: "triggers", count: 4, latency: "direct" })).controls.notes.latency, "direct");
});

test("2. U015: a Control that names no Event input, with a did-you-mean; a value input; a part-local Control with to", () => {
  const ds = refused(one("note", { kind: "triggers", count: 4 }));
  assert.deepEqual(ds.map((d) => d.code), ["U015"]);
  assert.match(ds[0].message, /Did you mean 'notes'\?/);
  assert.deepEqual(ds[0].path, ["controls", "note"]);
  const value = refused(one("level", { kind: "number", min: 0, max: 1, value: 0 }));
  assert.deepEqual(value.map((d) => d.code), ["U015"]);
  assert.match(value[0].message, /an Event input/);
  const local = defineUI(synth(), one("detune", { kind: "number", min: 0, max: 1, value: 0, to: "param.detune" }));
  assert.equal(local.controls.detune.local, true);
  assert.equal(local.controls.detune.input, null);
  assert.equal(defineUI(synth(), one("volume", { kind: "number", min: 0, max: 1, value: 0, to: "param.gain" })).controls.volume.local, false, "an input and a to: live and committed");
});

test("3. U016: a Control whose record does not fit its input's seam, both seams printed; a dropped and a filled field build", () => {
  const missing = refused(one("notes", { kind: "number", min: 0, max: 1, value: 0 }));
  assert.deepEqual(missing.map((d) => d.code), ["U016"]);
  assert.match(missing[0].message, /Event<\{ value: f64 \}>/);
  assert.match(missing[0].message, /Event<\{ index: f64, on: bool, velocity: f64 \}>/);
  assert.deepEqual(codes(one("word", { kind: "number", min: 0, max: 1, value: 0 })), ["U016"], "a wrong type");
  assert.deepEqual(codes(one("wideWave", { kind: "choice", options: ["sine", "saw", "square"], value: "sine" })), ["U016"], "an enum the input does not accept");
  assert.deepEqual(codes(one("volume", { kind: "number", min: 0, max: 1, value: 0, each: () => [] })), ["U016"], "a keyed Control whose input lacks key");
  assert.deepEqual(codes(one("soft", { kind: "triggers", count: 4 })), [], "a dropped field: velocity");
  assert.deepEqual(codes(one("gate", { kind: "number", min: 0, max: 1, value: 0 })), [], "a filled field: the input's default");
});

test("4. U017, one case each from the kind table's list", () => {
  const n = (/** @type {Record<string, unknown>} */ o) => one("volume", { kind: "number", min: 0, max: 1, value: 0.5, ...o });
  const cases = [
    ["an unknown kind, with a did-you-mean", one("volume", { kind: "nubmer", min: 0, max: 1, value: 0 }), /Did you mean 'number'\?/],
    ["an unknown key", n({ colour: 1 }), /no key 'colour'/],
    ["a missing key", one("volume", { kind: "number", min: 0, max: 1 }), /needs 'value'/],
    ["min not below max", n({ min: 1, max: 1, value: 1 }), /min/],
    ["a value outside the range", n({ value: 2 }), /outside/],
    ["a value not among options", one("wave", { kind: "choice", options: ["sine", "saw"], value: "tri" }), /options/],
    ["a log curve with min at 0", n({ curve: "log" }), /log/],
    ["buttons that are not identifiers", one("pads", { kind: "buttons", buttons: ["hold", "la tch"] }), /identifier/],
    ["buttons that repeat", one("pads", { kind: "buttons", buttons: ["hold", "hold"] }), /twice/],
    ["a grid naming an unknown button", one("pads", { kind: "buttons", buttons: ["hold", "latch"], grid: [["hold", "push"]] }), /push/],
    ["a grid naming a button twice", one("pads", { kind: "buttons", buttons: ["hold", "latch"], grid: [["hold", "hold"]] }), /twice/],
    ["a code that is not a KeyboardEvent.code", one("pads", { kind: "buttons", buttons: ["hold", "latch"], keys: { hold: ["space"] } }), /KeyboardEvent\.code/],
    ["more keys than count", one("notes", { kind: "triggers", count: 2, keys: ["KeyA", "KeyS", "KeyD"] }), /count/],
    ["a MIDI number outside 0..127", n({ midi: { cc: 200 } }), /127/],
    ["a perFrame that is not whole", n({ perFrame: 1.5 }), /perFrame/],
    ["an each that is not a function", n({ each: [] }), /each/],
    ["an unknown latency", one("notes", { kind: "triggers", count: 4, latency: "audio" }), /direct/],
  ];
  for (const [label, decl, why] of cases) {
    const ds = refused(decl);
    assert.ok(ds.length > 0 && ds.every((d) => d.code === "U017"), `${label}: ${ds.map((d) => `${d.code} ${d.message}`).join("; ")}`);
    assert.match(ds.map((d) => d.message).join(" "), why, label);
  }
});

test("5. each: the record seam gains key, lower(record) gives the instances, and a bad result is U017 at the instance", () => {
  const each = (/** @type {any} */ f) => one("ratio", { kind: "number", min: 0.25, max: 16, value: 1, curve: "log", each: f });
  const ui = defineUI(synth(), each((r) => Object.entries(r.ops).map(([k, o]) => ({ key: k, label: k, value: o.ratio, to: `arg.s.op#${Object.keys(r.ops).indexOf(k)}:1.ratio` }))));
  assert.equal(ui.controls.ratio.seam, "Event<{ key: str, value: f64 }>");
  assert.equal(ui.controls.ratio.keyed, true);
  const record = synth()("s").op("a", { ratio: 2, level: 1 }).op("b", { ratio: 3, level: 1 }).build();
  const lowered = ui.lower(record);
  assert.deepEqual(lowered.instances.ratio.map((i) => [i.key, i.value, i.to]), [["a", 2, "arg.s.op#0:1.ratio"], ["b", 3, "arg.s.op#1:1.ratio"]]);
  assert.equal(lowered.instances.ratio[0].min, 0.25, "the declaration's keys are the fallback");
  const bad = (/** @type {any} */ f) => defineUI(synth(), each(f)).lower(record).diagnostics.filter((d) => d.code === "U017");
  assert.equal(bad(() => 3).length, 1, "not a list");
  const twice = bad(() => [{ key: "a" }, { key: "a" }]);
  assert.equal(twice.length, 1);
  assert.deepEqual(twice[0].path, ["controls", "ratio", "each", 1]);
  const out = bad(() => [{ key: "a", value: 99 }]);
  assert.deepEqual(out.map((d) => d.path), [["controls", "ratio", "each", 0]]);
});

test("10. annotate.params takes look, curve and step; a bad one is U012", () => {
  const ui = defineUI(synth(), { annotate: { params: { gain: { look: "knob", curve: "log", step: 0.01 } } } });
  assert.deepEqual({ ...ui.annotate.params.gain }, { look: "knob", curve: "log", step: 0.01 });
  for (const bad of [{ look: "dial" }, { curve: "exp" }, { step: 0 }]) {
    assert.deepEqual(codes({ annotate: { params: { gain: bad } } }), ["U012"], JSON.stringify(bad));
  }
});

test("11. retired: inputs and emits are U001 with the new tips, controlName is gone, no ui.control, and pad is now controls", () => {
  const inputs = refused({ inputs: { object: "Pad", buttons: {} } });
  assert.deepEqual(inputs.map((d) => d.code), ["U001"]);
  assert.match(inputs[0].tip, /controls/);
  const emits = refused({ stage: { element: "synth-keys", module: "./synth-keys.js", emits: ["pick"] } });
  assert.deepEqual(emits.map((d) => d.code), ["U001"]);
  assert.match(emits[0].tip, /wb-control/);
  assert.equal("controlName" in define, false);
  assert.equal("control" in defineUI(synth(), {}), false);
  const pad = refused({ tiles: { t: { title: "T", place: { splitBelow: "pad" }, body: [{ kind: "text", value: "x" }] } } });
  assert.deepEqual(pad.map((d) => d.code), ["U003"]);
  assert.match(pad[0].message, /Did you mean 'controls'\?/);
  assert.deepEqual(Object.keys(UI_CODES).filter((c) => ["U009", "U010"].includes(c)), [], "U009 and U010 retire");
  for (const c of ["U015", "U016", "U017", "U018", "U019", "U020"]) assert.ok(Object.hasOwn(UI_CODES, c), c);
});

test("12. the UI value is frozen, its controls, grips and actions included", () => {
  const ui = defineUI(synth(), {
    stage: { draw: "view" },
    controls: { notes: { kind: "triggers", count: 4, keys: ["KeyA", "KeyS"] } },
    grips: { g: { kind: "translate", at: (s) => [s.voices, 0], to: () => "param.gain" } },
    actions: { save: { label: "Save", module: "./save.js", export: "save", gives: "file" } },
  });
  assert.ok(Object.isFrozen(ui));
  for (const k of ["controls", "grips", "actions"]) assert.ok(Object.isFrozen(ui[k]), k);
  assert.ok(Object.isFrozen(ui.controls.notes));
  assert.ok(Object.isFrozen(ui.controls.notes.decl.keys));
  assert.ok(Object.isFrozen(ui.grips.g));
  assert.ok(Object.isFrozen(ui.actions.save));
});
