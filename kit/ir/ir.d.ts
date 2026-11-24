// The kit's core IR: kernels made of statements and expressions, every node with a
// span into its lambda's source, every statement with the effects it performs. The
// JSON form of a Kernel is the IR's diffable form; `printKernel` gives a listing.

/** Character offsets into the kernel's `src`, as the parser's `range`. */
export type Span = [number, number];

/**
 * A value type. Numbers are plain doubles (`f64`) everywhere: a sized integer is a
 * storage rule on a place (see `Store`), not a value type.
 */
export type Type =
  | "f64" | "bool" | "str" | "null" | "void"
  /** The type of an expression that already failed to lower; it silences cascades. */
  | "unknown"
  /** One of a fixed set of strings: sprite names, choice options, buttons. */
  | { enum: string[] }
  /** A live entity of this kind. */
  | { ref: string }
  /** A value that may be empty (null or undefined at run time). */
  | { opt: Type }
  /** A list of at most `max` items, so a loop over it is bounded. `len` is its exact length, recorded only for an array literal: a constant index below it is never empty. `with` adds that object's members (a game board's `at`). */
  | { list: Type; max: number; len?: number; with?: string }
  /** A record. `optional` names fields that may be left out. */
  | { struct: Record<string, Type>; optional?: string[] }
  /** Any one of these: a draw result, a printf argument. */
  | { union: Type[] }
  /** A handle onto something the dialect provides (the world, input, a HUD cell). */
  | { obj: string }
  /** A type variable in a dialect signature, bound per call. */
  | { tvar: string };

/** How a store coerces its value: the dialect's numeric rule for one place. */
export interface Coerce {
  /**
   * `f64` checks only finiteness. Sized integers truncate toward zero, then clamp to
   * `min`/`max` when given, then wrap into the type's range. `fix` rounds to 1/256,
   * clamps, then wraps into [-128, 128).
   */
  type: "u8" | "i8" | "u16" | "i16" | "fix" | "bool" | "enum" | "f64";
  min?: number;
  max?: number;
  values?: string[];
}

/** A read or write of state, or an intrinsic with an effect. Rendered `verb what`, e.g. `write Mole.ttl`. */
export type EffectVerb = "read" | "write" | "rng" | "emit" | "sfx" | "toast" | "spawn" | "destroy" | "call" | "hud" | "input" | "log" | "end";
export type Effect = `${EffectVerb} ${string}` | EffectVerb;

/** A field of an entity or the world: an attribute, a built-in like `x`, a baked constant. */
export interface Place {
  recv: Expr;
  /** The kind or object that owns the field, e.g. `Mole` or `World`. */
  owner: string;
  name: string;
  t: Type;
  /** Present when the place is writable: the coercion every store applies. */
  store?: Coerce;
}

interface ExprBase { t: Type; span: Span }

export type Expr =
  | (ExprBase & { k: "num"; v: number })
  | (ExprBase & { k: "str"; v: string })
  | (ExprBase & { k: "bool"; v: boolean })
  | (ExprBase & { k: "null" })
  /** JavaScript's `undefined`: what an unsuccessful `find` yields. */
  | (ExprBase & { k: "undef" })
  | (ExprBase & { k: "local"; name: string })
  /** A name the dialect provides to every lambda, e.g. `Math`. */
  | (ExprBase & { k: "global"; name: string })
  | (ExprBase & { k: "load"; place: Place })
  /** An operator; evaluated left to right. See `OPS` in ops.js for each one's meaning. */
  | (ExprBase & { k: "op"; op: Op; args: Expr[] })
  /** Lazy: evaluates only the branch taken. */
  | (ExprBase & { k: "cond"; test: Expr; then: Expr; else: Expr })
  /** A dialect intrinsic, `fn` named by its path (`w.rng.pick`, `Math.max`, `at`). */
  | (ExprBase & { k: "call"; fn: string; recv?: Expr; args: Expr[]; effects: Effect[] })
  /** A method the program defines on an entity kind or the world. */
  | (ExprBase & { k: "method"; owner: string; name: string; recv: Expr; args: Expr[]; effects: Effect[] })
  /** A top-level helper function of the program, called by name; it has no receiver. */
  | (ExprBase & { k: "helper"; name: string; args: Expr[]; effects: Effect[] })
  | (ExprBase & { k: "struct"; fields: Record<string, Expr> })
  | (ExprBase & { k: "field"; of: Expr; name: string })
  /** `of[index]`: the item, or JavaScript's `undefined` when out of range, so its type is `{ opt }`. */
  | (ExprBase & { k: "index"; of: Expr; index: Expr })
  /** An array literal: its type is `{ list, max, len }`, both the number of items; items are evaluated in order. */
  | (ExprBase & { k: "array"; items: Expr[] })
  /** A new empty list, filled by `push`. */
  | (ExprBase & { k: "list" });

/**
 * Operators. Arithmetic is on doubles with JavaScript's meaning (`rem` is `%`);
 * the bitwise ones go through int32 as in JavaScript. `and`/`or` take bools and
 * short-circuit. `present` takes a possibly-empty entity reference (`{ opt: { ref } }`)
 * and is false only for null or undefined. `truthy` is JavaScript truthiness, for every
 * other value tested as a condition, optionals of numbers, bools and strings included:
 * 0, NaN, "" and false are false there.
 */
export type Op =
  | "add" | "sub" | "mul" | "div" | "rem" | "pow" | "neg" | "pos"
  | "band" | "bor" | "bxor" | "bnot" | "shl" | "shr" | "ushr"
  | "eq" | "ne" | "lt" | "le" | "gt" | "ge"
  | "not" | "and" | "or" | "truthy" | "present" | "concat";

interface StmtBase { span: Span; effects: Effect[] }

export type Stmt =
  /** Declares a local (or a temporary); a null `value` leaves it for a later `set`. */
  | (StmtBase & { k: "let"; name: string; t: Type; value: Expr | null })
  /** Assigns an existing local. */
  | (StmtBase & { k: "set"; name: string; value: Expr })
  /** Writes a place, applying `place.store`. The stored value never flows back into the expression that wrote it. */
  | (StmtBase & { k: "store"; place: Place; value: Expr })
  /** Evaluates an expression for its effects. */
  | (StmtBase & { k: "do"; value: Expr })
  | (StmtBase & { k: "if"; test: Expr; then: Stmt[]; else: Stmt[] })
  /** `for (let name = init; test; update)`: `bound` names what bounds it, e.g. `param burst`. */
  | (StmtBase & { k: "for"; name: string; init: Expr; test: Expr; update: Stmt[]; body: Stmt[]; bound: string })
  /** Runs `body` once per item of `list`, binding `name`; at most `max` times. */
  | (StmtBase & { k: "each"; name: string; t: Type; list: Expr; max: number; body: Stmt[] })
  /** Appends to a list local made by a `list` expression. */
  | (StmtBase & { k: "push"; name: string; value: Expr })
  | (StmtBase & { k: "return"; value: Expr | null })
  | (StmtBase & { k: "break" })
  | (StmtBase & { k: "continue" });

export interface Local {
  name: string;
  t: Type;
  /** `param` for the kernel's own parameters; `temp` for values lowering introduced. */
  kind: "param" | "const" | "let" | "temp";
  /** The name in the source, when lowering renamed it to keep names unique. */
  source?: string;
}

/** A function plus the Iteration Space it runs over. */
export interface Kernel {
  ir: "kernel";
  /** The slot it fills, e.g. `Mole.onFrame#0`. */
  name: string;
  /** The dialect's slot kind, e.g. `onFrame`. */
  slot: string;
  /** What it runs over, e.g. `entity Mole`, `tick`, `render`. */
  space: string;
  params: Local[];
  returns: Type;
  locals: Local[];
  body: Stmt[];
  /** Every effect in the body, deduplicated, in first-seen order. */
  effects: Effect[];
  /** The lambda's source text; every span indexes into it. */
  src: string;
  span: Span;
}
