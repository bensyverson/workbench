// The LIR: the first stage below the core IR. A Kernel as a target with no host and no f64
// can take it: every value one of four types, every conversion and enum ordinal written out,
// every intrinsic bound to its spelling, every name a legal identifier. See README.md.

import type { Span } from "../ir/ir.js";

/** A value type. No f64, and a vector is always of f32 (a Dialect's `color` is a `vec3` here). */
export type LType = "f32" | "i32" | "bool" | { vec: 2 | 3 | 4 };

/** How a target spells an intrinsic: a call template (`$0`, `$1` are the arguments) and text it needs defined first. */
export interface Spelling {
  call: string;
  prelude?: string;
}

interface ExprBase { t: LType; span: Span }

export type LExpr =
  /** An f32 (already rounded to one: `Math.fround(v) === v`) or an i32 (a whole number in range). */
  | (ExprBase & { k: "num"; v: number })
  | (ExprBase & { k: "bool"; v: boolean })
  | (ExprBase & { k: "local"; name: string })
  /** A read of one of the program's `uniforms`, by its identifier. */
  | (ExprBase & { k: "uniform"; name: string })
  /** `add sub mul div neg`, `lt le gt ge eq ne`, `not and or`: operand and result types are `OPS` in verify-rules.js. */
  | (ExprBase & { k: "op"; op: LOp; args: LExpr[] })
  /** Between f32 and i32, the target's own rule (`int(x)` truncates toward zero). `t` is the type converted to. */
  | (ExprBase & { k: "conv"; of: LExpr })
  /** An intrinsic bound to its spelling; `name` is the Dialect's name for it, and its prelude is in the program's `preludes`. */
  | (ExprBase & { k: "call"; name: string; spelling: Spelling; args: LExpr[] })
  /** A call to one of the program's helper kernels. */
  | (ExprBase & { k: "helper"; name: string; args: LExpr[] })
  /** A vector built from f32 components, in order. */
  | (ExprBase & { k: "vec"; items: LExpr[] })
  /** One component of a vector: `x`, `y`, `z` or `w`. */
  | (ExprBase & { k: "swizzle"; of: LExpr; name: string })
  /** Lazy: evaluates only the branch taken. */
  | (ExprBase & { k: "cond"; test: LExpr; then: LExpr; else: LExpr });

export type LOp = "add" | "sub" | "mul" | "div" | "neg" | "lt" | "le" | "gt" | "ge" | "eq" | "ne" | "not" | "and" | "or";

interface StmtBase { span: Span }

export type LStmt =
  | (StmtBase & { k: "let"; name: string; t: LType; value: LExpr | null })
  | (StmtBase & { k: "set"; name: string; value: LExpr })
  | (StmtBase & { k: "do"; value: LExpr })
  | (StmtBase & { k: "if"; test: LExpr; then: LStmt[]; else: LStmt[] })
  /** `for (t name = init; test; update)`; `update` is assignments, and `bound` is the core's record of what bounds it. */
  | (StmtBase & { k: "for"; name: string; t: LType; init: LExpr; test: LExpr; update: Array<StmtBase & { k: "set"; name: string; value: LExpr }>; body: LStmt[]; bound: string })
  | (StmtBase & { k: "return"; value: LExpr })
  | (StmtBase & { k: "break" })
  | (StmtBase & { k: "continue" });

export interface LParam { name: string; t: LType }

/** A function. `name` is a legal identifier in the target; `source` is the core Kernel's name, for messages and the line map. */
export interface LKernel {
  ir: "lir-kernel";
  name: string;
  source: string;
  params: LParam[];
  returns: LType;
  /** Every `let` and `for` variable of the body (each name once, and none a parameter). */
  locals: LParam[];
  body: LStmt[];
  /** The core Kernel's source text; every span indexes into it. */
  src: string;
  span: Span;
}

/** A value the host supplies once per draw. */
export interface LUniform {
  /** The identifier in the target. */
  name: string;
  t: LType;
  /** The Dialect's name for it (`u.angle` is `angle`). */
  source: string;
  /** For a choice, the options in order; the uniform holds an index into them (an i32). */
  options?: string[];
  /** Set when the core types the value f64: the host supplies an f64 and it is narrowed to an f32 at upload. */
  host?: "f64";
}

export interface LPrelude { name: string; text: string }

/**
 * One entry kernel and what it calls. `helpers` are in dependency order, callees first, so a
 * target that must declare before use can emit them as listed; `main` comes after.
 */
export interface LProgram {
  ir: "lir";
  name: string;
  uniforms: LUniform[];
  /** Text intrinsics need defined first, each once, in order of first use. */
  preludes: LPrelude[];
  helpers: LKernel[];
  main: LKernel;
}

/** A reason a Kernel cannot be lowered, or a broken LIR invariant. `kernel` is the core Kernel's name; `span` indexes its `src`. */
export interface LirDiagnostic {
  code: string;
  message: string;
  kernel: string;
  span: Span | null;
}
