// The fields Dialect: a small language for per-pixel color. What it means (types, intrinsics with each target's
// spelling, the pixel Iteration Space, targets) is declared through the Definition API in dialect.js; how a
// Program is written (`field`) is the builder defineGrammar generates; `lowerField` lowers one. The Dialect's
// own numbers are f32: a bare literal is an f32 (`numberType`), and operators take their meaning from the types.

export { fields, FIELDS_DIALECT, INTRINSICS, LIBRARY, libraryFor, fieldsEnvironment, UNIFORMS, VECTORS, VEC2, VEC3, VEC4, COLOR, ALIASES } from "./dialect.js";
export { field } from "./grammar.js";
export { lowerField } from "./program.js";
