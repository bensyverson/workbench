// The checker's passing fixture: a tiny per-pixel color language, borrowed from the api-draft's fields
// example and shaped as rules.md asks (the file names are the trial's, the language is not data-tools).
// A layer's channel lambdas are typed against the channels the steps before them made (construct state).
import { defineDialect, vector, scalar, exact, tolerance, enumOf, object } from "kit/define";

export const data = defineDialect({
  name: "tint",
  numberType: "f32",
  types: {
    vec2: vector(2, "f32"),
    color: vector(3, "f32", { aliases: { r: "x", g: "y", b: "z" } }),
    stamp: scalar("f64", { note: "milliseconds since 1970-01-01, UTC" }),
  },
  spaces: { pixel: { pure: true } },
  objects: {
    Uniforms: { label: "the uniforms (u)", members: { t: "f32", aspect: "f32", started: "stamp" } },
    Params: { label: "the params ($)", members: {} },
  },
  globals: { $: "Params" },
  intrinsics: {
    floor: {
      params: ["T"], returns: "T", numeric: "number", componentwise: true,
      ref: Math.floor,
      spell: { js: "Math.floor($0)", glsl: "floor($0)" },
    },
    mix: {
      params: ["T", "T", "f32"], returns: "T", numeric: "number", componentwise: true,
      ref: (a, b, t) => a + (b - a) * t,
      spell: { js: { call: "mix($0, $1, $2)", prelude: "const mix = (a, b, t) => a + (b - a) * t;" }, glsl: "mix($0, $1, $2)" },
    },
    sin: { params: ["f32"], returns: "f32", ref: Math.sin, spell: { js: "Math.sin($0)", glsl: "sin($0)" } },
  },
  library: {
    pmod: { fn: "(x, n) => x - n * floor(x / n)" },
    HALF: { const: "0.5" },
  },
  targets: {
    js: { accepts: "*", compare: exact() },
    glsl: { accepts: ["pixel"], compare: tolerance(1e-3) },
  },
  slots: {
    pixel: { params: ["vec2", "Uniforms"], returns: "color", space: "pixel" },
    channel(ref, program, state) {
      if (Object.keys(state.channels).length >= 4) return "a layer holds at most four channels";
      return { params: [object(`the channels of ${ref.on}`, state.channels), "Uniforms"], returns: "infer", space: "pixel" };
    },
  },
  environment(program) {
    const members = {};
    for (const [n, p] of Object.entries(program.params ?? {})) members[n] = "options" in p ? enumOf(p.options) : "f32";
    return { objects: { Params: { members } } };
  },
});
