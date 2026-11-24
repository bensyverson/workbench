// The fields Dialect as an Environment: its types, its intrinsics as callable globals, the
// uniforms a Program's params become, and the calling convention of each slot.

import { dialectEnum } from "../../ir/types.js";
import { VECTORS, ALIASES, COLOR, VEC2 } from "./types.js";
import { INTRINSICS } from "./intrinsics.js";

/** @import { Type } from "../../ir/ir.js" */
/** @import { Environment, ObjectDecl, Member, SlotRef, SlotDecl } from "../../lower/environment.js" */
/** @import { ParamDecl } from "./decls.js" */

/** The object a pixel lambda's `u` is: its params and the built-ins. */
export const UNIFORMS = "Uniforms";

/** The built-in uniforms every pixel sees, beside the Program's params. */
const BUILT_IN = /** @type {Record<string, Member>} */ ({
  t: { kind: "value", t: "f32" },
  aspect: { kind: "value", t: "f32" },
});

/**
 * The type of a param's uniform: f32 for a number (an integer is a whole f32, as `ihash` takes),
 * the choice's enum for options, bool for a toggle.
 * @param {string} name
 * @param {ParamDecl} p
 * @returns {Type}
 */
export function paramType(name, p) {
  if ("options" in p) return dialectEnum(p.options);
  if (typeof p.value === "boolean") return "bool";
  if (typeof p.value === "number") return "f32";
  throw new Error(`param '${name}' has no type: give a number, a toggle (true or false) or a choice (value and options)`);
}

/**
 * A number param whose `max` an f32 counter reaches exactly (at most 2^24 - 1) is a size: the author set a cap.
 * @param {ParamDecl} p
 */
const isSize = (p) => "max" in p && typeof p.max === "number" && p.max <= 2 ** 24 - 1;

/**
 * The environment for one fields Program: the Dialect plus that Program's params.
 * @param {Record<string, ParamDecl>} [params]
 * @returns {Environment}
 */
export function fieldsEnvironment(params = {}) {
  /** @type {Record<string, Member>} */
  const members = { ...BUILT_IN };
  for (const [name, p] of Object.entries(params)) {
    if (name in BUILT_IN) throw new Error(`param '${name}' clashes with the built-in uniform u.${name}`);
    members[name] = { kind: "value", t: paramType(name, p), ...(isSize(p) ? { size: true } : {}) };
  }
  /** @type {Record<string, ObjectDecl>} */
  const objects = { [UNIFORMS]: { label: "the uniforms (u)", members } };
  /** @type {Record<string, Type>} */
  const globals = {};
  // An intrinsic is called by name, so it is a global whose type is an object that can be called.
  for (const [name, i] of Object.entries(INTRINSICS)) {
    objects[name] = { label: name, members: {}, call: i.sig };
    globals[name] = { obj: name };
  }
  return {
    name: "fields",
    objects,
    list: {},
    queries: [],
    globals,
    vectors: VECTORS,
    // No f64 value reaches a fields Lambda (every number is an f32), so there is nothing to convert.
    conversions: {},
    componentAliases: ALIASES,
    numberType: "f32",
    slot: slotOf,
  };
}

/**
 * The calling convention of each fields slot. A pixel is pure: it reads its uniforms and nothing else.
 * @param {SlotRef} ref
 * @returns {SlotDecl | string}
 */
function slotOf(ref) {
  switch (ref.kind) {
    case "pixel": return { params: [VEC2, { obj: UNIFORMS }], returns: COLOR, space: "pixel", forbid: [] };
    case "helper": return { params: [], inferParams: true, returns: "infer", space: `helper ${ref.key}`, forbid: [] };
    case "const": return { params: [], returns: "infer", space: `constant ${ref.key}`, forbid: [] };
  }
  return `the fields Dialect has no '${ref.kind}' slot`;
}
