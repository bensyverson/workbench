// The kit's core IR: kernels made of statements and expressions, every node with a
// span into its lambda's source, every statement with the effects it performs. The
// JSON form of a Kernel is the IR's diffable form; `printKernel` gives a listing.

/** Character offsets into the kernel's `src`, as the parser's `range`. */
export type Span = [number, number];

/**
 * A value type. A number is a double (`f64`) or a single (`f32`), and the two never mix:
 * a conversion is an explicit `f32` or `f64` op. A sized integer is a storage rule on a
 * place (see `Coerce`), not a value type.
 */
export type Type =
  | "f64" | "f32" | "bool" | "str" | "null" | "void"
  /**
   * A handle onto an image a Kernel only samples (a Dialect's intrinsic reads it, as fields' `sample`). Opaque: no
   * operator, field or condition takes it, and nothing holds it. A sampler value is a load of a read-only place (a
   * uniform) or a Kernel parameter, and it stands only as an argument of a call; a type never holds one inside it.
   */
  | "sampler"
  /** The type of an expression that already failed to lower; it silences cascades. */
  | "unknown"
  /** One of a fixed set of strings: sprite names, choice options, buttons. `declared` marks a dialect's enum, which is nominal; the enum of a string literal has no mark. */
  | { enum: string[]; declared?: true }
  /** A live entity of this kind. */
  | { ref: string }
  /** A value that may be empty (null or undefined at run time). */
  | { opt: Type }
  /** A list of at most `max` items, so a loop over it is bounded. The one exception is a Dialect's state list declared `list(type)`: the Dialect's `stateType` leaves its `max` out though it is typed here as a number, and the UI's lowering (kit/define/ui/lower.js) gives it `OPEN_MAX` before kit/lower sees it, since a kernel's list always has a max.  `len` is its exact length, recorded only for an array literal: a constant index below it is never empty. `with` adds that object's members (a game board's `at`). */
  | { list: Type; max: number; len?: number; with?: string }
  /** A record. `optional` names fields that may be left out. */
  | { struct: Record<string, Type>; optional?: string[] }
  /** Any one of these: a draw result, a printf argument. */
  | { union: Type[] }
  /** A handle onto something the dialect provides (the world, input, a HUD cell). */
  | { obj: string }
  /** A type variable in a dialect signature, bound per call. */
  | { tvar: string }
  | VecType
  | ScalarType;

/**
 * A vector of `vec` components of one scalar type, read as `.x`, `.y`, `.z`, `.w`. `name` marks a
 * dialect's vector type, which is nominal: `vec3` and `color` never meet, though both are three
 * f32s. A vector without a name is structural (`f32x3`). See `dialectVector` in types.js.
 */
export interface VecType { vec: 2 | 3 | 4; of: "f32" | "f64"; name?: string }

/**
 * A Dialect's nominal scalar: a named type stored as its backing number (`of`, always `f64`), such as a
 * date held as milliseconds since the epoch. It compares (`lt` … `ge`, `eq`, `ne`) only with its own
 * kind, no arithmetic, sign, bitwise or conversion operator takes it, and it is never tested for
 * truthiness. The IR knows the name only as a name: what it means is the Dialect's, through its
 * intrinsics. See `dialectScalar` in types.js.
 */
export interface ScalarType { scalar: string; of: "f64" }

/** How a store coerces its value: the dialect's numeric rule for one place. */
export interface Coerce {
  /**
   * `f64` and `f32` check only finiteness, of a place of that number type. Sized integers truncate toward zero, then clamp to
   * `min`/`max` when given, then wrap into the type's range. `fix` rounds to 1/256,
   * clamps, then wraps into [-128, 128). `value` stores the value unchanged, of any type, and refuses
   * nothing: a Definition API writable member, whose host decides what a non-finite number means.
   */
  type: "u8" | "i8" | "u16" | "i16" | "fix" | "bool" | "enum" | "f64" | "f32" | "value";
  min?: number;
  max?: number;
  values?: string[];
}

/** A read or write of state, or an intrinsic with an effect. Rendered `verb what`, e.g. `write Mole.ttl`. `bump` adds to a total (`bump Counters.hits`). */
export type EffectVerb = "read" | "write" | "bump" | "rng" | "emit" | "sfx" | "toast" | "spawn" | "destroy" | "call" | "hud" | "input" | "log" | "end";
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
  /** Present when the Dialect declares this read-only place a size: it bounds a `for` loop. Never set with `store`. */
  size?: true;
  /**
   * Present when the place is a shared total: an f64 a Kernel only adds to (`bump`), never stores. Reading one
   * records `read Owner.name`, as reading a writable place does. Never set with `store` or `size`.
   */
  total?: true;
}

interface ExprBase { t: Type; span: Span }

export type Expr =
  /** A number. Typed `f32`, `v` is already an f32 value (`Math.fround(v) === v`). */
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
  /** An operator; evaluated left to right. Each one's meaning is at `Op` below; its operand and result types are `OPS` in verify-rules.js. */
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
  /** Whole-list concatenation, `[...a, x, ...b]`: each part is a list (a plain item run is an `array` part), in order. Its type is `{ list, max }` with the parts' maxes summed, and `len` the parts' lengths summed when every part has one. */
  | (ExprBase & { k: "concat"; parts: Expr[] })
  /** A new empty list, filled by `push`. */
  | (ExprBase & { k: "list" })
  /** A vector built from its components, evaluated in order: one item per component, each of the vector's scalar type. */
  | (ExprBase & { k: "vec"; items: Expr[] });

/**
 * Operators. Arithmetic is on doubles with JavaScript's meaning (`rem` is `%`), or on
 * two f32s with the result rounded to f32; the bitwise ones take doubles and go through
 * int32 as in JavaScript. On vectors, `add`, `sub`, `mul`, `div`, `neg` and `pos` are
 * componentwise over one vector type, and `mul` (either order) and `div` (vector first)
 * also take a scalar of the vector's scalar type. `f32` rounds an f64 to the nearest
 * f32 (JavaScript's `Math.fround`); `f64` widens an f32 exactly. Each operator's operand
 * and result types are `OPS` in verify-rules.js. `and`/`or` take bools and
 * short-circuit. `present` takes any possibly-empty value (`{ opt: … }`) and is false only
 * for null or undefined: what `x != null` means, so 0, "" and a date at the epoch are
 * present. `truthy` is JavaScript truthiness, for a value tested as a condition (an
 * optional number, bool or string included): 0, NaN, "" and false are false there.
 */
export type Op =
  | "add" | "sub" | "mul" | "div" | "rem" | "pow" | "neg" | "pos"
  | "band" | "bor" | "bxor" | "bnot" | "shl" | "shr" | "ushr"
  | "eq" | "ne" | "lt" | "le" | "gt" | "ge"
  | "not" | "and" | "or" | "truthy" | "present" | "concat"
  | "f32" | "f64";

interface StmtBase { span: Span; effects: Effect[] }

export type Stmt =
  /** Declares a local (or a temporary); a null `value` leaves it for a later `set`. */
  | (StmtBase & { k: "let"; name: string; t: Type; value: Expr | null })
  /** Assigns an existing local. */
  | (StmtBase & { k: "set"; name: string; value: Expr })
  /** Writes a place, applying `place.store`. The stored value never flows back into the expression that wrote it. */
  | (StmtBase & { k: "store"; place: Place; value: Expr })
  /** Adds an f64 to a total (`place.total`), recorded `bump Owner.name`. It reads nothing, so the order bumps run in never shows in a Kernel. */
  | (StmtBase & { k: "bump"; place: Place; value: Expr })
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
  /**
   * The CPU-only features the body uses, each once, with its first span (the CPU tier draft, project/2026-11-27-cpu-tier-draft.md).
   * A Kernel with none is Bench. Always empty today, and the verifier's Bench profile (V013) refuses any.
   */
  needs: Need[];
  /** The lambda's source text; every span indexes into it. */
  src: string;
  span: Span;
}

/** The five features only the CPU tier has. */
export type NeedKind = "loop" | "recursion" | "heap" | "text" | "fnref";

/** A CPU-only feature a Kernel uses: which, where, and the callee it came through when it is not the Kernel's own. */
export interface Need {
  need: NeedKind;
  span: Span;
  via?: string;
}
