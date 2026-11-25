// The Definition API's types: what defineDialect and defineGrammar take, the tagged helper values,
// the Dialect value, and the diagnostics. The spec is scripts/define-trial/docs/api-draft.md.

import type { TAG } from "./tags.js";
import type { Environment, FnSig, SlotRef } from "../lower/environment.js";
import type { Type } from "../ir/ir.js";
import type { Diagnostic, Loc } from "../parse/ast.js";
import type { UnitDecl, Spelling } from "../dialects/fields/decls.js";

export type VectorTag = { [TAG]: "vector"; n: unknown; elem: unknown; options: unknown };
export type ScalarTag = { [TAG]: "scalar"; of: unknown; options: unknown };
export type ExactTag = { [TAG]: "exact" };
export type ToleranceTag = { [TAG]: "tolerance"; figure: unknown };
export type ListTag = { [TAG]: "list"; of: unknown; max: unknown };
export type OptTag = { [TAG]: "opt"; of: unknown };
export type StructTag = { [TAG]: "struct"; fields: unknown; options: unknown };
export type UnionTag = { [TAG]: "union"; of: unknown[] };
export type EnumTag = { [TAG]: "enum"; values: unknown };
export type ObjectTag = { [TAG]: "object"; label: unknown; members: unknown };
/** The argument specs. `as` is the record key a trailing `{ as }` named; `opts` that object, kept for validation. */
interface SpecBase { count: number; as: string | undefined; opts: unknown }
/** `within`: the construct whose nearest enclosing instance the name is unique in (absent: the whole Program). */
export type NameTag = { [TAG]: "name"; ns: unknown; within: unknown } & SpecBase;
export type RefTag = { [TAG]: "ref"; ns: unknown } & SpecBase;
export type DataTag = { [TAG]: "data"; shape: unknown } & SpecBase;
export type LambdaTag = { [TAG]: "lambda"; convention: unknown } & SpecBase;
export type RestTag = { [TAG]: "rest"; spec: unknown } & SpecBase;
export type OneOfTag = { [TAG]: "oneOf"; of: unknown[] };
export type RecordOfTag = { [TAG]: "recordOf"; of: unknown };
export type ListOfTag = { [TAG]: "listOf"; of: unknown };
export type Tagged = VectorTag | ScalarTag | ExactTag | ToleranceTag | ListTag | OptTag | StructTag | UnionTag | EnumTag | ObjectTag
  | NameTag | RefTag | DataTag | LambdaTag | RestTag | OneOfTag | RecordOfTag | ListOfTag;

/** A type as a definition writes it: a name, or a helper's value. */
export type TypeDef = string | Tagged;

export interface IntrinsicDef {
  params: TypeDef[];
  returns: TypeDef;
  minArgs?: number;
  rest?: TypeDef;
  numeric?: "number" | "vector";
  componentwise?: boolean;
  ref: (...args: number[]) => number;
  spell: Record<string, string | Spelling>;
}

export type LibraryDef = { fn: string } | { const: string };

/**
 * A slot convention as declared: static, or a function of where the lambda sits. `may` lists the effects its lambda
 * may have, as patterns (`"write Plant"`, `"bump Totals"`, `"rng"`, `"read Totals.n"`); absent, none.
 */
export interface ConventionDef { params: TypeDef[]; returns: TypeDef | "infer"; space: string; may?: string[]; /** `"block"`: an expression body is an L error. */ body?: "block" }
export type ConventionFn = (ref: DefineSlotRef, program: Record<string, unknown>, state: unknown) => ConventionDef | string;

/** What a slot convention function receives: the core SlotRef plus the call's position. */
export interface DefineSlotRef extends SlotRef {
  /**
   * The call's position among its construct instance's calls, from 0, counting every slot. Without `record: "calls"`
   * the record keeps no order across slots, so the calls are counted slot by slot in declaration order.
   */
  index?: number;
  /** The lambda's key inside a `recordOf`; else the declared name when the slot's first argument is a `name()`. */
  key?: string;
}

/** What `environment(program)` returns: objects (members merge into declared ones) and globals. */
export interface EnvironmentAddition {
  objects?: Record<string, { label?: string; members?: Record<string, unknown> }>;
  globals?: Record<string, TypeDef>;
}

/** A space: pure (its lambdas change nothing), or an instance space (each lambda is handed one `instance` and may change only it). */
export type SpaceDef = { pure: true } | { instance: string };

/**
 * A declared object. A member is a type, `{ value, size?, write?, bump? }`, `{ fn, effects? }` or `{ keyed }`;
 * `call` makes the object itself callable, with `effects` saying what calling it does.
 */
export interface ObjectDef {
  label?: string;
  members?: Record<string, unknown>;
  call?: { params: TypeDef[]; returns: TypeDef; minArgs?: number; rest?: TypeDef };
  effects?: string[];
  /** Members a lambda may not use, each with why: a lambda that does gets the message instead of "has no member" (L002). A name here may not also be a member (D007). */
  rejected?: Record<string, { message: string; tip?: string; fix?: string }>;
}

export interface DialectDef {
  name: string;
  numberType: "f32" | "f64";
  types?: Record<string, Tagged>;
  spaces: Record<string, SpaceDef>;
  objects?: Record<string, ObjectDef>;
  globals?: Record<string, TypeDef>;
  intrinsics?: Record<string, IntrinsicDef>;
  library?: Record<string, LibraryDef>;
  conversions?: Record<string, "f32" | "f64">;
  list?: Record<string, unknown>;
  queries?: string[];
  targets: Record<string, { accepts: "*" | string[]; compare: ExactTag | ToleranceTag }>;
  slots: Record<string, ConventionDef | ConventionFn>;
  /** What a constant may call: `"pure"` lets it call a pure helper; `"none"`, the default, forbids every call. */
  constants?: { calls: ConstantCalls };
  environment?: (program: Record<string, any>) => EnvironmentAddition;
  /** `"bool"`: a condition (an if or ternary test, an operand of ! && ||) must be a bool; a number there is an L error. Absent, any value is truthy. */
  conditions?: "bool";
  /** What a helper may do: reads only. Absent, a read of each instance space's object. */
  helpers?: { may?: string[]; check?: HelperCheck };
  /** The text view: the Dialect's screen and state as characters, sized for a model. What `state` is, the Dialect says. Required (D020). */
  text: (state: any) => string;
  /**
   * The RUN's state: the shape of the value `text(state)` and the UI's views are handed. Not a Grammar construct's build-time state.
   * A plain object of member types in this Dialect's vocabulary ("f64", "bool", "str", a declared vector or scalar, enumOf, opt, list(of, max)); write a nested object as struct({ … }). Optional; malformed is D023.
   */
  state?: Record<string, TypeDef>;
  /** The object a lambda reads the Program's params through, the name it reads it by, and the members known only at run time, which build-time code may not read (B014). */
  params?: { object: string; name: string; runtime?: string[] };
}

/** Which top-level helpers lowering checks: `"called"` (the default) those a lambda reaches, `"all"` every function, reached or not (their parameters then stay untyped, so what they do through one is not checked). */
export type HelperCheck = "called" | "all";

/** What a Dialect's constants may call. Stores and emits stay forbidden either way. */
export type ConstantCalls = "none" | "pure";

/** One intrinsic as the backends read it: the shape of kit/dialects/fields/intrinsics.js entries, one spelling per target. */
export interface Intrinsic {
  sig: FnSig;
  ref: (...args: number[]) => number;
  componentwise?: boolean;
  [target: string]: unknown;
}

export type Compare = { kind: "exact" } | { kind: "tolerance"; figure: number };

/** One place a run's state does not fit its declaration: the path ("" for the root) and what was expected. */
export interface StateMismatch { path: string; message: string }

/** What defineDialect returns. */
export interface Dialect {
  readonly name: string;
  readonly numberType: "f32" | "f64";
  readonly def: DialectDef;
  readonly intrinsics: Record<string, Intrinsic>;
  readonly library: UnitDecl[];
  readonly targets: Record<string, { accepts: "*" | string[]; compare: Compare }>;
  /** The text view, as the definition gave it; with `state` declared it first checks its argument and throws an error naming the paths that do not fit. */
  text(state: any): string;
  /** The declared run's state, as written (absent when the Dialect declares none). */
  readonly state?: Record<string, TypeDef>;
  /** The declared run's state as a core Type (a struct), for lowering lambdas that read it. */
  readonly stateType?: Type;
  /** Every place `value` does not fit the declared state, by path (`player.x`, `bodies[1].mass`); [] when it fits. Present only with `state`. */
  readonly checkState?: (value: unknown) => StateMismatch[];
  /** The Library units the sources use, in dependency order. */
  libraryFor(sources: string[]): UnitDecl[];
  /** The Environment for one Program record; `states` gives each stateful lambda's construct state, by slot id. */
  environment(program: Record<string, any>, states?: Map<string, unknown>): Environment;
}

/** A problem in a definition: where in it (a path of keys), what, and the fix. */
export interface DefineDiagnostic {
  code: string;
  severity: "error";
  message: string;
  tip: string;
  path: Array<string | number>;
  /** A U007 inside a lambda: the line within that lambda (1-based) the problem is on. */
  line?: number;
  /** The define call's place in the author's file. */
  file: string;
  loc: Loc;
}

/** A diagnostic of the generated builder: the kit's shape, at the builder call, plus its file. */
export interface BuildDiagnostic extends Diagnostic {
  file: string;
  /** The argument it is about: a position, or a path into it. */
  arg?: number | Array<string | number>;
  /** The mechanical replacement text, when there is one (no range: the builder does not read the file). */
  fix?: string;
  /** The construct instance and slot a step's `ctx.error` refused. */
  on?: string;
  slot?: string;
  /** The Runtime Lambda it is about, on a refusal found when lowering (B011). */
  ref?: DefineSlotRef;
  /** The Runtime Lambda a B007, B008, B012 or B013 is about: its source, and the place inside it when known (the first line is 1). */
  lambda?: { src: string; loc?: Loc };
}

/**
 * What a host passes to `.check(options)` and `.build(options)`: the Program file's module scope.
 * `scope` is its top-level bindings by name (a lambda's free name one of them holds resolves into the record's
 * units: an arrow function as a helper, plain data as a constant); `sources` each top-level declaration's
 * initializer text by name (`topLevelBindings(text)`, and `topLevelFunctions(text)` for `function` declarations), since an arrow is a helper only when its text is its
 * declaration's (else B012: another function made it, and its closure is lost); `buildTime` the names the file
 * declares only inside build-time code (`buildTimeNames(text)`), which a lambda reading one is told it cannot
 * see (B013).
 */
export interface BuildOptions {
  scope?: Record<string, unknown>;
  sources?: Record<string, string>;
  buildTime?: string[];
  /** The subset of `buildTime` the file binds as a `const`/`let`/`var`, `catch` or loop variable (`buildTimeBindings(text)`): such a name is a build-time local even when another lambda also has a parameter of it, so B013 keeps its build-time wording. Absent, a name that is another lambda's parameter is told so. */
  buildTimeBindings?: string[];
  /** The keyword each top-level binding is declared with (`topLevelBindings` gives `const` and `let`, `topLevelFunctions` `function`), copied onto the units as `keyword`, so a Dialect's root `check` can refuse a top-level `let`. Absent, a unit has no `keyword`. */
  keywords?: Record<string, "const" | "let" | "function">;
  /** The names the file declares at its top level and again below it (`buildTimeShadows(text)`); a lambda that reads one is B013, since its text cannot say which it means. */
  shadowed?: string[];
}

/** What a slot's or construct's `check` receives besides the call or record. */
export interface CheckContext {
  /** The record so far (at `.build()`, the whole record). */
  program: Record<string, any>;
  /** The construct's state before the call; undefined at build, since state needs lowering (see README). */
  state: unknown;
  error(code: string, message: string, options?: ErrorOptions | string): void;
}

/**
 * What a check's or a step's `ctx.error` takes after the code and message (a string is taken as `{ tip }`):
 * the tip, the argument it is about (a did-you-mean against `suggest` when that argument is a string), and a
 * mechanical replacement (the tip defaults to `write <fix>`).
 */
export interface ErrorOptions { tip?: string; arg?: number | Array<string | number>; suggest?: string[]; fix?: string }

export interface SlotDef {
  kind: "decl" | "unit";
  args?: Tagged[];
  unit?: "fn" | "const";
  once?: boolean;
  required?: boolean;
  as?: string;
  check?: (call: { slot: string; args: any[] }, ctx: CheckContext) => void;
}

/** What `step` receives besides the state, the call and the inferred types. */
export interface StepContext {
  /** The record, as init's `program`. */
  program: Record<string, any>;
  /** Another stateful instance's final state, by instance name, as init's `stateOf`; a loop through it is B010. */
  stateOf(name: string): any;
  /** Refuses this call with the Dialect's own code, pinned at the call, as a check's does. The state `step` returns still applies. */
  error(code: string, message: string, options?: ErrorOptions | string): void;
}

export interface StateDef {
  init(opened: Record<string, any>, ctx: { program: Record<string, any>; stateOf(name: string): any }): any;
  step(state: any, call: { slot: string; args: any[] }, inferred: any, ctx: StepContext): any;
  names?: Record<string, (state: any) => string[]>;
}

export interface ConstructDef {
  opens?: Tagged[];
  parent?: string;
  /** A child construct its parent must open at least once (B005 when a parent instance has none). */
  required?: boolean;
  slots?: Record<string, SlotDef>;
  record?: "calls";
  state?: StateDef;
  /** A stateless construct's namespaces, each a function of its record and other instances' final states; its refs into them are checked when lowered (B003). */
  names?: Record<string, (record: Record<string, any>, ctx: { program: Record<string, any>; stateOf(name: string): unknown }) => string[]>;
  rejected?: Record<string, { message: string; tip?: string; fix?: string }>;
  check?: (record: Record<string, any>, ctx: CheckContext) => void;
}

export interface GrammarDef {
  root: string;
  constructs: Record<string, ConstructDef>;
  /** The root slot that declares the Program's params (name, declaration with its `value`), which `run` reads them from. */
  params?: { slot: string };
}

/** What defineGrammar returned: the builder function, with its Dialect and definition. */
export type GrammarBuilder = ((...args: unknown[]) => any) & { dialect: Dialect; grammar: GrammarDef; lower: (record: Record<string, any>) => import("./lower.js").Lowered };

/** The UI declaration `defineUI` takes: what is left after the generated views. The run's state is not here; the Dialect declares it. A value is a path into the Dialect's state ("bounds.width") or a lambda `(s, $) => …` (a table column's: `(row, s, $) => …`). */
export interface UIDef {
  /** The custom element that draws the stage: `{ element: "<pkg>-<name>", module: "./<file>.js", emits?: ["pick" | "select" | "param"] }`. */
  stage?: Record<string, unknown>;
  /** `{ object: "Pad", buttons: { left: { role: "dpad.left" }, … } }`: the Dialect object whose bool members are the buttons. */
  inputs?: Record<string, unknown>;
  /** Your panels by id: `{ title, place, body: [components] }`. */
  tiles?: Record<string, Record<string, unknown>>;
  /** Marks on the generated `traces` and `params` views. */
  annotate?: Record<string, Record<string, Record<string, unknown>>>;
}

/** What a host passes defineUI beyond the declaration. */
export interface UIOptions {
  /** A package file's text by its `"./<file>.js"` path, or null when it is not a readable file. A host that cannot read files omits it, and the custom element module checks (a module that exists and defines its tag) are skipped. */
  moduleText?: (path: string) => string | null;
}

/** What defineUI returns: the checked, frozen UI. */
export interface UI {
  readonly package: string;
  readonly builder: GrammarBuilder;
  readonly dialect: Dialect;
  readonly stage?: Readonly<Record<string, unknown>>;
  readonly inputs?: Readonly<Record<string, unknown>>;
  readonly tiles: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  readonly annotate: Readonly<Record<string, unknown>>;
}
