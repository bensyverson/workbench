// The Definition API's types: what defineDialect and defineGrammar take, the tagged helper values,
// the Dialect value, and the diagnostics. The spec is scripts/define-trial/docs/api-draft.md.

import type { TAG } from "./tags.js";
import type { Environment, FnSig, SlotRef } from "../lower/environment.js";
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
export type NameTag = { [TAG]: "name"; ns: unknown } & SpecBase;
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

/** A slot convention as declared: static, or a function of where the lambda sits. */
export interface ConventionDef { params: TypeDef[]; returns: TypeDef | "infer"; space: string }
export type ConventionFn = (ref: DefineSlotRef, program: Record<string, unknown>, state: unknown) => ConventionDef | string;

/** What a slot convention function receives: the core SlotRef plus the call's position. */
export interface DefineSlotRef extends SlotRef {
  /** The call's position among its construct instance's calls, from 0, counting every slot. */
  index?: number;
}

/** What `environment(program)` returns: objects (members merge into declared ones) and globals. */
export interface EnvironmentAddition {
  objects?: Record<string, { label?: string; members?: Record<string, unknown> }>;
  globals?: Record<string, TypeDef>;
}

export interface DialectDef {
  name: string;
  numberType: "f32" | "f64";
  types?: Record<string, Tagged>;
  spaces: Record<string, { pure: true }>;
  objects?: Record<string, { label?: string; members?: Record<string, unknown> }>;
  globals?: Record<string, TypeDef>;
  intrinsics?: Record<string, IntrinsicDef>;
  library?: Record<string, LibraryDef>;
  conversions?: Record<string, "f32" | "f64">;
  list?: Record<string, unknown>;
  queries?: string[];
  targets: Record<string, { accepts: "*" | string[]; compare: ExactTag | ToleranceTag }>;
  slots: Record<string, ConventionDef | ConventionFn>;
  environment?: (program: Record<string, any>) => EnvironmentAddition;
}

/** One intrinsic as the backends read it: the shape of kit/dialects/fields/intrinsics.js entries, one spelling per target. */
export interface Intrinsic {
  sig: FnSig;
  ref: (...args: number[]) => number;
  componentwise?: boolean;
  [target: string]: unknown;
}

export type Compare = { kind: "exact" } | { kind: "tolerance"; figure: number };

/** What defineDialect returns. */
export interface Dialect {
  readonly name: string;
  readonly numberType: "f32" | "f64";
  readonly def: DialectDef;
  readonly intrinsics: Record<string, Intrinsic>;
  readonly library: UnitDecl[];
  readonly targets: Record<string, { accepts: "*" | string[]; compare: Compare }>;
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
}

/** What a slot's or construct's `check` receives besides the call or record. */
export interface CheckContext {
  /** The record so far (at `.build()`, the whole record). */
  program: Record<string, any>;
  /** The construct's state before the call; undefined at build, since state needs lowering (see README). */
  state: unknown;
  error(code: string, message: string, options?: { tip?: string; arg?: number | Array<string | number>; suggest?: string[]; fix?: string }): void;
}

export interface SlotDef {
  kind: "decl" | "unit";
  args?: Tagged[];
  unit?: "fn" | "const";
  once?: boolean;
  required?: boolean;
  as?: string;
  check?: (call: { slot: string; args: any[] }, ctx: CheckContext) => void;
}

export interface StateDef {
  init(opened: Record<string, any>, ctx: { program: Record<string, any>; stateOf(name: string): any }): any;
  step(state: any, call: { slot: string; args: any[] }, inferred: any): any;
  names?: Record<string, (state: any) => string[]>;
}

export interface ConstructDef {
  opens?: Tagged[];
  parent?: string;
  slots?: Record<string, SlotDef>;
  record?: "calls";
  state?: StateDef;
  rejected?: Record<string, { message: string; tip?: string }>;
  check?: (record: Record<string, any>, ctx: CheckContext) => void;
}

export interface GrammarDef {
  root: string;
  constructs: Record<string, ConstructDef>;
}
