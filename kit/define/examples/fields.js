// The fields Dialect and its `field` Grammar through the Definition API: the draft's worked example
// (scripts/define-trial/docs/api-draft.md), completed. The intrinsics and the Library are read from the
// hand-written Dialect (kit/dialects/fields) rather than retyped, so the two cannot drift; the tests
// prove the Environment, the intrinsic table, the builder and the Kernels equal to the hand-written ones.

import { defineDialect, defineGrammar, vector, exact, tolerance, name, data, lambda, oneOf, enumOf } from "../index.js";
import { INTRINSICS } from "../../dialects/fields/intrinsics.js";
import { LIBRARY } from "../../dialects/fields/library.js";

/** @import { Type } from "../../ir/ir.js" */
/** @import { Spelling } from "../../dialects/fields/decls.js" */
/** @import { IntrinsicDef, LibraryDef } from "../define.js" */

/** @param {Type} t */
const typeName = (t) => (typeof t === "string" ? t : /** @type {{ tvar: string }} */ (t).tvar);
/** @param {Spelling} s */
const spelling = (s) => (s.prelude ? { call: s.call, prelude: s.prelude } : s.call);

/** @type {Record<string, IntrinsicDef>} */
const intrinsics = Object.fromEntries(Object.entries(INTRINSICS).map(([n, i]) => [n, {
  params: i.sig.params.map(typeName),
  returns: typeName(i.sig.returns),
  ...(i.sig.numeric ? { numeric: i.sig.numeric } : {}),
  ...(i.componentwise ? { componentwise: true } : {}),
  ref: i.ref,
  spell: { js: spelling(i.js), glsl: spelling(i.glsl) },
}]));

/** @type {Record<string, LibraryDef>} */
const library = Object.fromEntries(LIBRARY.map((u) => [u.name, u.kind === "fn" ? { fn: u.src } : { const: u.src }]));

/** A capped number may bound a loop: an f32 counter reaches it exactly up to 2^24 - 1. */
const SIZE_CAP = 2 ** 24 - 1;

export const fields = defineDialect({
  name: "fields",
  numberType: "f32",
  types: {
    vec2: vector(2, "f32"), vec3: vector(3, "f32"), vec4: vector(4, "f32"),
    color: vector(3, "f32", { aliases: { r: "x", g: "y", b: "z" } }),
  },
  spaces: { pixel: { pure: true } },
  objects: { Uniforms: { label: "the uniforms (u)", members: { t: "f32", aspect: "f32" } } },
  intrinsics,
  library,
  targets: {
    js: { accepts: "*", compare: exact() },
    glsl: { accepts: ["pixel"], compare: tolerance(1e-3) },
  },
  slots: { pixel: { params: ["vec2", "Uniforms"], returns: "color", space: "pixel" } },

  // Each param becomes a uniform, read in the pixel lambda as u.name.
  environment(program) {
    /** @type {Record<string, unknown>} */
    const members = {};
    for (const [n, p] of Object.entries(/** @type {Record<string, any>} */ (program.params ?? {}))) {
      const t = "options" in p ? enumOf(p.options) : typeof p.value === "boolean" ? "bool" : "f32";
      const size = typeof p.max === "number" && p.max <= SIZE_CAP;
      members[n] = size ? { value: t, size: true } : t;
    }
    return { objects: { Uniforms: { members } } };
  },
});

const ParamShape = oneOf(
  { value: "number", "min?": "number", "max?": "number", "step?": "number" },
  { value: "string", options: "string[]" },
  { value: "boolean" },
);

export const field = defineGrammar(fields, {
  root: "field",
  constructs: {
    field: {
      opens: [name()],
      slots: {
        param: {
          kind: "decl", args: [name("uniform"), data(ParamShape)], as: "params",
          check({ args: [n, p] }, ctx) {
            const decl = /** @type {{ value: unknown, min?: number, max?: number }} */ (p);
            if (n === "t" || n === "aspect") ctx.error("F002", `param '${n}' clashes with the built-in uniform u.${n}`, { arg: 0, tip: "rename the param" });
            if (typeof decl.value === "number" && (decl.value < (decl.min ?? -Infinity) || decl.value > (decl.max ?? Infinity))) {
              ctx.error("F001", `param '${n}': its value ${decl.value} lies outside its range ${decl.min ?? "-∞"}..${decl.max ?? "∞"}`, { arg: 1, tip: "move the value inside min..max" });
            }
          },
        },
        fn: { kind: "unit", unit: "fn" },
        const: { kind: "unit", unit: "const" },
        pixel: { kind: "decl", args: [lambda("pixel")], once: true, required: true },
      },
      // The hand-written field() keeps params, helpers and the Library in one namespace: a param may not
      // share a name with a helper or a Library entry.
      check(record, ctx) {
        const units = /** @type {Array<{ name: string }>} */ (record.units).map((u) => u.name);
        for (const n of Object.keys(/** @type {object} */ (record.params))) {
          if (units.includes(n) || Object.hasOwn(library, n)) ctx.error("F003", `field '${record.name}' cannot declare param '${n}': ${Object.hasOwn(library, n) ? "the Library" : "a helper or constant"} already has that name`, { tip: "rename the param" });
        }
      },
    },
  },
});
