// An environment in the kit's terms (a Dialect plus one Program's declarations): what runtime lambdas may name, the
// types of those names, the effects they have, and each slot's calling convention.
// Lowering resolves every identifier and member against this and nothing else.

import type { Type, Coerce, Effect, EffectVerb, VecType } from "../ir/ir.js";

/** A callable signature. `{key}` in an effect is replaced by a keyed call's literal key. */
export interface FnSig {
  params: Type[];
  /** Fewer arguments than `params` are allowed down to this many. Defaults to all. */
  minArgs?: number;
  /** Extra arguments past `params`, each of this type (printf). */
  rest?: Type;
  returns: Type;
  effects: Effect[];
  /**
   * For a signature with a type variable: what the variable may be bound to. `number` is an f32, an
   * f64 or a vector; `vector` only a vector. Absent, anything.
   */
  numeric?: "number" | "vector";
}

export type Member =
  /**
   * A field. Writable when `store` is present; `effect` is what a read records. `size` declares a
   * read-only number that stays small for the whole run (a grid's rows, a param's capped max), so a
   * loop `i < it` ends: being read-only is not enough (`w.frame` never stops growing). `bump` makes an f64 a
   * total: changed only by a `+=` or `++` statement, which lowers to the IR's bump; never with `store`.
   */
  | { kind: "value"; t: Type; store?: Coerce; effect?: Effect; size?: boolean; bump?: true }
  | ({ kind: "fn" } & FnSig)
  /**
   * The first argument must be a string literal naming one of `keys` (a param, a
   * pool, a sound); the rest of the signature depends on which. `what` names the
   * key in messages.
   */
  | { kind: "keyed"; what: string; keys: Record<string, Omit<FnSig, "effects">>; effects: Effect[] }
  /** Sends a payload on a channel named by a string literal; payload types are inferred per name. */
  | { kind: "emit"; effects: Effect[] }
  /** A method the program defines; its signature is inferred from its lambda and call sites. */
  | { kind: "method"; owner: string; name: string };

export interface ObjectDecl {
  /** How messages name it, e.g. `Mole` or `the world`. */
  label: string;
  members: Record<string, Member>;
  /** Present when the object itself is called, like the HUD's `at(col, row)`. */
  call?: FnSig;
}

/** The list operations that take a callback; lowering inlines each as a bounded loop. */
export type QueryName = "filter" | "find" | "some" | "every" | "reduce";

/** Names one runtime lambda's slot. */
export interface SlotRef {
  /** The slot id, e.g. `Mole.onFrame#0`; it names the kernel. */
  id: string;
  /** The slot kind, e.g. `onFrame`, `draw`, `on`. */
  kind: string;
  /** The object `self` is: an entity kind, or the dialect's world object. */
  on: string;
  /** The event of an `on` slot, the method of a `method` slot. */
  key?: string;
}

/** The parameter a slot passes in position `i`: a type, the slot's event payload, or the method's inferred parameter. */
export type SlotParam = Type | "payload";

export interface SlotDecl {
  params: SlotParam[];
  /** For a method, the arguments after `self` are inferred, so `params` holds only `self`. */
  inferParams?: boolean;
  /** `infer` takes the join of the body's returns (methods). */
  returns: Type | "infer";
  space: string;
  /** Effect verbs this slot may not perform, e.g. writes during render. */
  forbid: EffectVerb[];
  /**
   * When present, the effects this slot's lambda may have, as patterns: `verb`, `verb Obj` or `verb Obj.member`,
   * each matching its verb on that target or inside it. Any other effect (but `call`, which only marks a call) is
   * L004; a read of a total this slot may bump is L017. Absent, `forbid` alone judges the slot.
   */
  may?: string[];
  /** Why `forbid` holds, for the diagnostic's tip. */
  forbidWhy?: string;
  /** Where a forbidden effect belongs instead, when the Dialect has such a place ("Move it to an onFrame or an event handler"); it leads the tip. */
  forbidMove?: string;
}

export interface Environment {
  name: string;
  /** Every named object type: entity kinds and the handles (`World`, `Input`, …). */
  objects: Record<string, ObjectDecl>;
  /** Members of every list, with type variable `T` bound to the item type. */
  list: Record<string, Member>;
  queries: QueryName[];
  /** Free identifiers every lambda may use, e.g. `Math`. */
  globals: Record<string, Type>;
  /**
   * The dialect's vector types, by the name a lambda builds one with: `vec2(x, y)`. Each is
   * usually a `dialectVector` (kit/ir/types.js), so the names stay nominal. Operators on them
   * resolve on these types (D1); see kit/lower/numeric.js.
   */
  vectors?: Record<string, VecType>;
  /**
   * Other names for a vector type's components, by the vector type's name: `{ color: { r: "x", g: "y", b: "z" } }`.
   * Lowering reads an alias as the component it names, so the IR only ever holds x, y, z and w.
   */
  componentAliases?: Record<string, Record<string, string>>;
  /**
   * The type of a number literal where nothing else gives it one: a let's initializer, a helper's
   * argument, a ternary of literals, a for counter. Defaults to `f64`. A literal elsewhere takes the
   * type of the value it meets (`uv * 0.5` is an f32 literal), and top-level constants stay untyped
   * until each use.
   */
  numberType?: "f32" | "f64";
  /** The calls that convert between f64 and f32, by the name a lambda calls, with the type each gives: `{ f32: "f32" }`. */
  conversions?: Record<string, "f32" | "f64">;
  /** The calling convention of a slot, or a message saying why there is none. */
  slot(ref: SlotRef): SlotDecl | string;
}

/** What lowering inferred across a whole program: event payloads and method signatures. */
export interface Signatures {
  events: Record<string, Type>;
  /** Keyed `Owner.name`. A top-level helper is keyed `$.name`, its owner being the program. */
  methods: Record<string, MethodSig>;
  /** The program's top-level helpers by name, known before any lambda is lowered. */
  helpers?: Record<string, HelperDecl>;
}

/** A top-level binding of the program: a function lowered like a method, or a constant baked in at each use. */
export type HelperDecl =
  | { kind: "fn" }
  /** `value` is the constant's lowered initializer; null when it did not lower. `calls`: the helpers its initializer calls, lowered or not. */
  | { kind: "const"; value: import("../ir/ir.js").Expr | null; calls?: string[] };

/** What `lowerProgram` takes for a top-level binding: its name, and its source (a function, or a constant's initializer). */
export interface HelperSource {
  name: string;
  kind: "fn" | "const";
  src: string;
}

/** Where one argument of a call is: its lambda, its line there, and its range in that lambda's source. */
export interface ArgSite {
  slot: string;
  /** The slot's owner. A lambda shared by several kinds has one slot id and one site per owner. */
  on: string;
  line: number;
  range: [number, number];
}

/** A call from a lambda to a program method or helper, with what it passes. */
export interface CallSite {
  /** Keyed `Owner.name`; a helper's owner is `$`. */
  key: string;
  args: Type[];
  /** One per argument. */
  sites: ArgSite[];
  /** A call inside a baked constant's value, at the constant's use: it counts for what a lambda reaches, not for a parameter's type. */
  baked?: boolean;
}

/** A call site whose argument does not join the other call sites' type for its parameter. */
export interface SiteConflict extends ArgSite {
  /** The parameter's position after the slot's own parameters. */
  param: number;
  message: string;
  tip: string;
}

/** A program method's signature, inferred from its body and its call sites. */
export interface MethodSig {
  /** How many parameters it declares after the slot's own; a call with another count is L015. */
  arity: number;
  /** The strict join of the call sites' argument types, one per parameter. */
  params: Type[];
  /** The call sites that disagree with `params`; each is reported where it is. */
  conflicts?: SiteConflict[];
  returns: Type;
  effects: Effect[];
  /** The methods its body calls, keyed `Owner.name`. */
  calls?: string[];
  /** True when it, or a method it calls, failed to lower, so `effects` may be missing some. */
  partial?: boolean;
}
