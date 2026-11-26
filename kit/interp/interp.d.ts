// What the reference interpreter takes and reports.

import type { Kernel, Span, Coerce, Place } from "../ir/ir.js";

/** A value the interpreter holds: a number, string, bool, null, undefined, a vector (an array of numbers), a list, a record, or whatever a host gives. */
export type Value = unknown;

/**
 * The value of a `sampler` (kit/ir): an image of `width` by `height` texels, `data` holding each texel's red, green,
 * blue and alpha as bytes (0 to 255), four per texel, **row 0 the bottom** (texel `(i, j)` starts at `(j * width + i) * 4`),
 * as a WebGL texture uploaded without a flip is. The interpreter and the JS backend pass it whole to the intrinsics
 * that read it; how a Dialect samples it is the Dialect's (fields' `sample`).
 */
export interface SamplerImage {
  width: number;
  height: number;
  data: ArrayLike<number>;
}

/** What the Dialect gives an intrinsic: its reference implementation, on numbers. */
export interface IntrinsicRef {
  /**
   * On numbers. Where `componentwise` is set it is applied to each component of vector arguments, scalar arguments being passed whole; otherwise a vector argument's components are passed spread.
   * Any other argument (a sampler's `SamplerImage`) is passed whole, and a reference whose call returns a vector returns its components as an array.
   */
  ref: (...args: any[]) => number | number[];
  componentwise?: boolean;
}

/** What a run asks of the world a Kernel's effects reach. Every member is optional: the defaults work on plain JavaScript objects. */
export interface Host {
  /**
   * Performs a store. `value` is what the Kernel wrote and `coerced` what the place's rule makes of it.
   * The default assigns `coerced`; a host whose objects coerce for themselves assigns `value` (it may refuse it).
   */
  store?(place: Place, recv: Value, value: Value, coerced: Value): void;
  /** Performs a bump: adds `value` to the total `place` on `recv`. The default adds in place, in the order the run reaches it. */
  bump?(place: Place, recv: Value, value: Value): void;
}

/** One evaluated node, reported to `onNode` after it finishes. */
export interface NodeEvent {
  /** The node's kind: `op`, `local`, `let`, `for`, … */
  kind: string;
  /** True for a statement, false for an expression. */
  stmt: boolean;
  span: Span;
  /** An expression's result; for a statement, the value it handled (a `let`'s, a `store`'s, a `return`'s), else undefined. */
  value: Value;
  /** Where the node is in its kernel, as the verifier writes it: `body[0].then[1].value.args[0]`. */
  path: string;
  /** The name of the kernel the node belongs to. */
  kernel: string;
  /** How many kernel calls deep it ran: 0 in the kernel `run` was given. */
  depth: number;
}

/** What `run` needs from outside the Kernel. */
export interface RunEnv {
  /** Top-level helper kernels by name (a `helper` node). A plain function is called with the arguments. */
  helpers?: Record<string, Kernel | ((...args: any[]) => Value)>;
  /** Program methods by `Owner.name` (a `method` node), run with the receiver first. Others go to the receiver's own method. */
  methods?: Record<string, Kernel>;
  /** The Dialect's intrinsics by the name a Kernel calls them. */
  intrinsics?: Record<string, IntrinsicRef>;
  /** What a `global` node names (`Math`). */
  globals?: Record<string, Value>;
  host?: Host;
  /** Called after each node is evaluated. */
  onNode?: (event: NodeEvent) => void;
  /** Loop passes and calls allowed in one run before it stops with an error; default 10 million. */
  maxSteps?: number;
  /** Nested kernel calls allowed; default 200. */
  maxDepth?: number;
}

export type { Coerce };
