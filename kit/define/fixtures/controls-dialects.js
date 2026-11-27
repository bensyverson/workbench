// Test fixtures for declared Controls (project/2026-11-27-controls-draft.md): `synth`, an FM synth's Dialect whose
// Event inputs take one Control of every kind (notes from triggers, keyed operator values, an envelope's points, a
// waveform choice, a color, a word), and `lens`, a lens bench whose Draw stage takes the pointer and whose state lists
// the surfaces a Grip drags. Neither is a founding example. They live beside test/, since every file under a test/
// folder runs as a test.

import { defineDialect, defineGrammar, exact, list, struct, vector, name, data, listOf } from "../index.js";

/** One Event input per Control kind, and a few misfits, by name. */
export const SYNTH_INPUTS = {
  notes: "Event<{ index: f64, on: bool, velocity: f64 }>",
  soft: "Event<{ index: f64, on: bool }>",
  pads: "Event<{ hold: bool, latch: bool }>",
  mute: "Event<{ value: bool }>",
  volume: "Event<{ value: f64 }>",
  pan: "Event<{ value: vec2 }>",
  tint: "Event<{ value: vec3 }>",
  wave: "Event<{ value: 'sine' | 'saw' | 'square' }>",
  word: "Event<{ value: str }>",
  glass: "Event<{ value: str, nd: f64 }>",
  shape: "Event<{ value: list<vec2, 8> }>",
  ratio: "Event<{ key: str, value: f64 }>",
  env: "Event<{ key: str, value: list<vec2, 8> }>",
  wideWave: "Event<{ value: 'sine' | 'saw' }>",
  count: "Event<{ value: str }>",
  gate: "Event<{ value: f64, gate: f64 = 1 }>",
};

/** @returns {Record<string, any>} */
export const synthDecl = () => ({
  name: "synth",
  numberType: "f64",
  types: { vec2: vector(2, "f64"), vec3: vector(3, "f64") },
  spaces: { s: { pure: true } },
  objects: { Params: { label: "the params ($)", members: {} }, In: { label: "the inputs (inp)", members: {} } },
  globals: { $: "Params", inp: "In" },
  inputs: { object: "In", name: "inp" },
  targets: { js: { accepts: "*", compare: exact() } },
  slots: { k: { params: [], returns: "f64", space: "s" } },
  params: { object: "Params", name: "$" },
  environment(/** @type {any} */ program) {
    /** @type {Record<string, string>} */
    const params = {};
    for (const p of Object.keys(program.params ?? {})) params[p] = "f64";
    return { objects: { Params: { members: params } } };
  },
  state: { voices: "f64", ops: list(struct({ key: "str", value: "f64", x: "f64", y: "f64" }), 8) },
  frames: { px: { dims: 2, note: "pixels", extent: () => ({ min: [0, 0], max: [320, 200] }) } },
  files: { glasses: { kind: "csv", path: "glasses.csv", note: "the glass catalog" } },
  ports: {
    in: {
      ...Object.fromEntries(Object.entries(SYNTH_INPUTS).map(([n, seam]) => [n, { seam, note: `the ${n}` }])),
      level: { seam: "f64", default: 0, note: "a value input" },
    },
    out: { view: { seam: "Draw<16>@px", note: "the panel", from: () => [{ op: "rect", at: [0, 0], size: [1, 1], fill: "#ffffff" }] }, scope: { seam: "Draw<16>@px", note: "the scope", from: () => [{ op: "rect", at: [0, 0], size: [1, 1], fill: "#ffffff" }] } },
  },
  text: () => "",
});

/** The synth's Grammar: operators with a bounded ratio, an envelope's points, params. */
export function synthGrammar(dialect = defineDialect(/** @type {any} */ (synthDecl()))) {
  return defineGrammar(dialect, {
    root: "synth", params: { slot: "param" },
    constructs: {
      synth: {
        opens: [name()],
        slots: {
          param: { kind: "decl", args: [name("param"), data({ value: "number", "min?": "number", "max?": "number" })], as: "params" },
          op: { kind: "decl", args: [name("op"), data({ ratio: data("number", { min: 0.25, max: 16 }), level: data("number", { min: 0, max: 1 }) })], as: "ops" },
          voices: { kind: "decl", args: [data("number", { min: 1, max: 16, whole: true })], once: true },
          env: { kind: "decl", args: [data(listOf(listOf("number")))] },
          k: { kind: "decl", args: [data("number")] },
          tag: { kind: "decl", args: [data("string")] },
          on: { kind: "decl", args: [data("boolean")] },
        },
      },
      voice: { parent: "synth", opens: [], record: "calls", slots: { gain: { kind: "decl", args: [data("number", { min: 0, max: 1 })] } } },
    },
  });
}

export const synth = () => synthGrammar();

/** @returns {Record<string, any>} */
export const lensDecl = () => ({
  ...synthDecl(),
  name: "lens",
  state: { t: "f64", grips: list(struct({ x: "f64", y: "f64", dx: "f64", dy: "f64", target: "str" }), 16), handles: "f64" },
  ports: {
    in: {
      pointer: { seam: "Event<{ phase: 'down' | 'move' | 'up' | 'cancel' | 'wheel' | 'leave', at: point2@px, pointer: f64, buttons: f64, clicks: f64, wheel: vec2, hit: str, shift: bool, alt: bool, meta: bool }>", note: "the pointer" },
      thin: { seam: "Event<{ phase: 'down' | 'move' | 'up' | 'cancel' | 'wheel' | 'leave', at: point2@px }>", note: "a pointer seam missing fields" },
      word: { seam: "Event<{ value: str }>", note: "the word" },
    },
    out: { view: { seam: "Draw<16>@px", note: "the bench", from: () => [{ op: "rect", at: [0, 0], size: [1, 1], fill: "#ffffff" }] }, chart: { seam: "Draw<16>@px", note: "a chart", from: () => [{ op: "rect", at: [0, 0], size: [1, 1], fill: "#ffffff" }] }, power: { seam: "f64", from: () => 1, note: "a value" } },
  },
});

export const lens = () => defineGrammar(defineDialect(/** @type {any} */ (lensDecl())), {
  root: "bench", params: { slot: "param" },
  constructs: {
    bench: {
      opens: [name()],
      slots: {
        param: { kind: "decl", args: [name("param"), data({ value: "number", "min?": "number", "max?": "number" })], as: "params" },
        surface: { kind: "decl", args: [data({ radius: data("number", { min: -500, max: 500 }), gap: data("number", { min: 0, max: 50 }) })] },
      },
    },
  },
});
