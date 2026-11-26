// The fields Dialect, declared through the Definition API (kit/define): its types, the pixel Iteration Space,
// the uniforms, its intrinsics with each target's spelling, the Library, its targets and how each is compared
// with the reference interpreter, and the pixel slot's calling convention. Every table the rest of the kit
// reads (INTRINSICS, LIBRARY, FIELDS_DIALECT, the Environment) is read from the Dialect value made here.

import { defineDialect, vector, exact, tolerance, enumOf } from "../../define/index.js";
import { intrinsics } from "./intrinsics.js";
import { library } from "./library.js";
import { frameText } from "./text.js";

/** @import { Environment } from "../../lower/environment.js" */
/** @import { VecType } from "../../ir/ir.js" */
/** @import { ParamDecl, Intrinsic } from "./decls.js" */

/** The object a pixel lambda's `u` is: its params and the built-ins. */
export const UNIFORMS = "Uniforms";

/** The built-in uniforms every pixel sees, beside the Program's params. */
const BUILT_IN = { t: "f32", aspect: "f32" };

/** A number param whose `max` an f32 counter reaches exactly (at most 2^24 - 1) is a size: the author set a cap. */
const SIZE_CAP = 2 ** 24 - 1;

export const fields = defineDialect({
  name: "fields",
  /** The type of a number literal where nothing else gives it one: there are no f64 values in a fields Lambda. */
  numberType: "f32",
  // Nominal: `vec3` and `color` have one shape and are different types, so no operator mixes them.
  types: {
    vec2: vector(2, "f32"), vec3: vector(3, "f32"), vec4: vector(4, "f32"),
    color: vector(3, "f32", { aliases: { r: "x", g: "y", b: "z" } }),
  },
  /** Where a Kernel runs: over each pixel, from its position to a color, with no effects. */
  spaces: { pixel: { pure: true } },
  objects: { [UNIFORMS]: { label: "the uniforms (u)", members: BUILT_IN } },
  /** A pixel reads the params as members of u; u.t and u.aspect exist only while the field runs (B014 at build). */
  params: { object: UNIFORMS, name: "u", runtime: Object.keys(BUILT_IN) },
  intrinsics,
  library,
  /**
   * What each target accepts, and how its output is compared with the reference. The GLSL figure is the largest
   * absolute difference allowed in any color component (a quarter of an 8-bit step), measured on one GPU: see
   * `project/2026-11-23-m2-findings.md`.
   */
  targets: {
    js: { accepts: "*", compare: exact() },
    glsl: { accepts: ["pixel"], compare: tolerance(1e-3) },
  },
  /** A pixel is pure: it reads its position and its uniforms and nothing else. */
  slots: { pixel: { params: ["vec2", UNIFORMS], returns: "color", space: "pixel" } },
  /** A constant may call a pure helper (`.const("K", "g()")`), as it could before fields was declared here. */
  constants: { calls: "pure" },

  // Each param becomes a uniform, read in the pixel lambda as u.name: an f32 for a number (an integer is a whole
  // f32, as `ihash` takes), the choice's enum for options, bool for a toggle, a sampler for an image.
  environment(program) {
    /** @type {Record<string, unknown>} */
    const members = {};
    for (const [n, p] of Object.entries(/** @type {Record<string, ParamDecl>} */ (program.params ?? {}))) {
      if (Object.hasOwn(BUILT_IN, n)) throw new Error(`param '${n}' clashes with the built-in uniform u.${n}`);
      const t = "image" in p ? (p.image === true ? "sampler" : null) : "options" in p ? enumOf(p.options) : typeof p.value === "boolean" ? "bool" : typeof p.value === "number" ? "f32" : null;
      if (t === null) throw new Error(`param '${n}' has no type: give a number, a toggle (true or false), a choice (value and options) or an image ({ image: true })`);
      const size = "max" in p && typeof p.max === "number" && p.max <= SIZE_CAP;
      // defineProperty, not assignment: a param named __proto__ must be an own member, not set a prototype.
      Object.defineProperty(members, n, { value: size ? { value: t, size: true } : t, enumerable: true, writable: true, configurable: true });
    }
    return { objects: { [UNIFORMS]: { members } } };
  },
  // The text view's state is a rendered frame ({ width, height, pixels }, row 0 the bottom): see text.js.
  text: frameText,
});

/** The intrinsics as the backends read them: each with its signature, reference and `js` and `glsl` spellings. */
export const INTRINSICS = /** @type {Record<string, Intrinsic>} */ (/** @type {unknown} */ (fields.intrinsics));

/** The Library: Runtime Subset source, lowered like a Program's helpers. */
export const LIBRARY = fields.library;

/**
 * The Library units the sources use, in dependency order: those they name, then those they name.
 * @param {string[]} sources
 */
export const libraryFor = (sources) => fields.libraryFor(sources);

/**
 * The Environment for one fields Program: the Dialect plus that Program's params.
 * @param {Record<string, ParamDecl>} [params]
 * @returns {Environment}
 */
export const fieldsEnvironment = (params = {}) => fields.environment({ params });

const bare = fieldsEnvironment();

/** The types a lambda builds by name: `vec2(x, y)`, `color(r, g, b)`. */
export const VECTORS = /** @type {Record<"vec2" | "vec3" | "vec4" | "color", VecType>} */ (bare.vectors);
export const VEC2 = VECTORS.vec2;
export const VEC3 = VECTORS.vec3;
export const VEC4 = VECTORS.vec4;
export const COLOR = VECTORS.color;
/** A color's components may be read and written as r, g, b as well as x, y, z. */
export const ALIASES = /** @type {Record<string, Record<string, string>>} */ (bare.componentAliases);

/**
 * The Dialect as the backends and the harness read it. `targets` is the Dialect's, with what a target accepts in
 * the shape the GLSL backend reads (`{ domains }`); `compare` is `{ kind: "exact" }` or `{ kind: "tolerance", figure }`.
 */
export const FIELDS_DIALECT = Object.freeze({
  name: fields.name,
  numberType: fields.numberType,
  types: VECTORS,
  intrinsics: INTRINSICS,
  library: LIBRARY,
  targets: Object.fromEntries(Object.entries(fields.targets).map(([n, t]) => [n, { accepts: t.accepts === "*" ? /** @type {const} */ ("*") : { domains: t.accepts }, compare: t.compare }])),
});
