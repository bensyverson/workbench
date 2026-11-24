// The fields Dialect's vector types. Nominal: `vec3` and `color` have the same shape and are
// different types, so no operator mixes them (kit/ir/types.js, `dialectVector`).

import { dialectVector } from "../../ir/types.js";

export const VEC2 = dialectVector("vec2", 2, "f32");
export const VEC3 = dialectVector("vec3", 3, "f32");
export const VEC4 = dialectVector("vec4", 4, "f32");
export const COLOR = dialectVector("color", 3, "f32");

/** The types a lambda builds by name: `vec2(x, y)`, `color(r, g, b)`. */
export const VECTORS = { vec2: VEC2, vec3: VEC3, vec4: VEC4, color: COLOR };

/** A color's components may be read and written as r, g, b as well as x, y, z. */
export const ALIASES = { color: { r: "x", g: "y", b: "z" } };
