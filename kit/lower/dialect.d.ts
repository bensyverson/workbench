// A dialect description in the kit's terms: what runtime lambdas may name, the
// types of those names, the effects they have, and each slot's calling convention.
// Lowering resolves every identifier and member against this and nothing else.

import type { Type, Coerce, Effect, EffectVerb } from "../ir/ir.js";

/** A callable signature. `{key}` in an effect is replaced by a keyed call's literal key. */
export interface FnSig {
  params: Type[];
  /** Fewer arguments than `params` are allowed down to this many. Defaults to all. */
  minArgs?: number;
  /** Extra arguments past `params`, each of this type (printf). */
  rest?: Type;
  returns: Type;
  effects: Effect[];
}

export type Member =
  /** A field. Writable when `store` is present; `effect` is what a read records. */
  | { kind: "value"; t: Type; store?: Coerce; effect?: Effect }
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
  domain: string;
  /** Effect verbs this slot may not perform, e.g. writes during render. */
  forbid: EffectVerb[];
  /** Why `forbid` holds, for the diagnostic's tip. */
  forbidWhy?: string;
}

export interface Dialect {
  name: string;
  /** Every named object type: entity kinds and the handles (`World`, `Input`, …). */
  objects: Record<string, ObjectDecl>;
  /** Members of every list, with type variable `T` bound to the item type. */
  list: Record<string, Member>;
  queries: QueryName[];
  /** Free identifiers every lambda may use, e.g. `Math`. */
  globals: Record<string, Type>;
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
  /** `value` is the constant's lowered initializer; null when it did not lower. */
  | { kind: "const"; value: import("../ir/ir.js").Expr | null };

/** What `lowerProgram` takes for a top-level binding: its name, and its source (a function, or a constant's initializer). */
export interface HelperSource {
  name: string;
  kind: "fn" | "const";
  src: string;
}

/** A program method's signature, inferred from its body and its call sites. */
export interface MethodSig {
  params: Type[];
  returns: Type;
  effects: Effect[];
  /** The methods its body calls, keyed `Owner.name`. */
  calls?: string[];
  /** True when it, or a method it calls, failed to lower, so `effects` may be missing some. */
  partial?: boolean;
}
