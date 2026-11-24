// What a fields Program declares, as plain data: the input to `fieldsEnvironment`, and the
// record `field(…).build()` returns. Nothing here is fields code, only the shape of a Program.

/**
 * A parameter, in the one declaration form the proposal's §8.2 gives every Program: a number
 * (`{ value, min, max, step }`), a choice (`{ value, options }`) or a toggle (`{ value: true }`).
 * Every param is a uniform: constant across one frame, free to change between frames.
 */
export type ParamDecl =
  | { value: number; min?: number; max?: number; step?: number }
  | { value: string; options: string[] }
  | { value: boolean };

/** A top-level function (`kind: "fn"`) or constant of a Program, or of the Library. */
export interface UnitDecl {
  name: string;
  kind: "fn" | "const";
  src: string;
}

/** One fields Program: its params, its `pixel` Runtime Lambda, and the helpers beside it. */
export interface FieldProgram {
  name: string;
  params: Record<string, ParamDecl>;
  /** The source of `(uv, u) => color`: `uv` is a vec2, `u` holds the params, `t` and `aspect`. */
  pixel: string;
  /** The Program's own helpers and constants, in order. */
  units: UnitDecl[];
}

/** How one target spells an intrinsic: a call template (`$0`, `$1` are the arguments), and text it needs defined first. */
export interface Spelling {
  call: string;
  prelude?: string;
}

/** One intrinsic of the Dialect. */
export interface Intrinsic {
  /** The call signature, in the core's terms (`T` is a type variable). */
  sig: import("../../lower/environment.js").FnSig;
  js: Spelling;
  glsl: Spelling;
  /**
   * The reference implementation, on numbers: what the interpreter runs. Where `componentwise` is
   * set it is applied to each component of the vector arguments, scalar arguments being passed whole.
   */
  ref: (...args: number[]) => number;
  componentwise?: boolean;
}
