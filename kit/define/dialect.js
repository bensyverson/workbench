// defineDialect: a Dialect definition, checked, to a Dialect value that yields one Program's Environment
// (kit/lower/environment.d.ts, unchanged), the intrinsic table the backends read, and the Library.

import { validateDialect } from "./validate-dialect.js";
import { resolveType, resolveMember, intrinsicSig, checkType } from "./types.js";
import { isPlainObject, kindOf } from "./tags.js";
import { callSite } from "./site.js";
import { dialectVector, dialectScalar } from "../ir/types.js";

/** @import { Type, VecType, ScalarType, EffectVerb } from "../ir/ir.js" */
/** @import { Environment, ObjectDecl, SlotDecl, SlotRef } from "../lower/environment.js" */
/** @import { UnitDecl } from "../dialects/fields/decls.js" */
/** @import * as T from "./define.js" */
/** @import { Problem, Resolver } from "./types.js" */

/** A bad definition: every problem found, each a DefineDiagnostic. */
export class DefinitionError extends Error {
  /** @param {string} what @param {T.DefineDiagnostic[]} diagnostics */
  constructor(what, diagnostics) {
    super(`${what} refused:\n${diagnostics.map((d) => `  ${d.code} ${d.path.join(".") || "(top)"}: ${d.message}\n    fix: ${d.tip}`).join("\n")}`);
    this.name = "DefinitionError";
    this.diagnostics = diagnostics;
  }
}

/**
 * Throws a DefinitionError if there are problems.
 * @param {string} what @param {Problem[]} problems
 */
export function refuse(what, problems) {
  if (!problems.length) return;
  const { file, loc } = callSite();
  throw new DefinitionError(what, problems.map((p) => ({ ...p, severity: /** @type {const} */ ("error"), file, loc })));
}

/** What defineDialect made, so defineGrammar can tell a Dialect from a look-alike. */
const MADE = new WeakSet();

/** @param {unknown} v @returns {v is T.Dialect} */
export const isDialect = (v) => typeof v === "object" && v !== null && MADE.has(v);

/** Every effect verb: what a constant may not do (a constant is computed once), as DMG's const convention. */
const ALL_EFFECTS = /** @type {EffectVerb[]} */ (["read", "input", "hud", "call", "write", "rng", "emit", "sfx", "toast", "spawn", "destroy", "end", "log"]);

/**
 * The library units the sources name, then those they name, in declaration order.
 * @param {UnitDecl[]} library @param {string[]} sources
 */
function libraryFor(library, sources) {
  const uses = (/** @type {string} */ src, /** @type {string} */ name) => new RegExp(`(?<![\\w.$])${name.replace(/\$/g, "\\$")}(?![\\w$])`).test(src);
  const wanted = new Set();
  const grow = (/** @type {string} */ src) => {
    for (const u of library) if (!wanted.has(u.name) && uses(src, u.name)) { wanted.add(u.name); grow(u.src); }
  };
  for (const s of sources) grow(s);
  return library.filter((u) => wanted.has(u.name));
}

/**
 * @param {T.DialectDef} def
 * @returns {T.Dialect}
 */
export function defineDialect(def) {
  refuse("defineDialect", validateDialect(def));
  /** @type {Record<string, VecType>} */
  const vectors = {};
  /** @type {Record<string, ScalarType>} */
  const scalars = {};
  /** @type {Record<string, Record<string, string>>} */
  const componentAliases = {};
  for (const [n, v] of Object.entries(def.types ?? {})) {
    // A nominal scalar is a type name only: unlike a vector, a lambda cannot call it to make one.
    if (kindOf(v) === "scalar") { scalars[n] = dialectScalar(n, "f64"); continue; }
    const vec = /** @type {T.VectorTag} */ (v);
    vectors[n] = dialectVector(n, /** @type {2 | 3 | 4} */ (vec.n), /** @type {"f32" | "f64"} */ (vec.elem));
    const aliases = /** @type {{ aliases?: Record<string, string> } | undefined} */ (vec.options)?.aliases;
    if (aliases) componentAliases[n] = { ...aliases };
  }
  /** @type {Resolver} */
  const statics = { vectors, scalars };
  const targetNames = Object.keys(def.targets);

  /** @type {Record<string, T.Intrinsic>} */
  const intrinsics = {};
  for (const [n, i] of Object.entries(def.intrinsics ?? {})) {
    /** @type {T.Intrinsic} */
    const entry = { sig: intrinsicSig(i, statics), ref: i.ref, ...(i.componentwise ? { componentwise: true } : {}) };
    for (const t of targetNames) {
      const s = i.spell[t];
      if (s !== undefined) entry[t] = typeof s === "string" ? { call: s } : { call: s.call, ...(s.prelude ? { prelude: s.prelude } : {}) };
    }
    intrinsics[n] = entry;
  }
  const library = Object.entries(def.library ?? {}).map(([name, l]) => ("fn" in l ? { name, kind: /** @type {const} */ ("fn"), src: l.fn } : { name, kind: /** @type {const} */ ("const"), src: l.const }));
  const targets = Object.fromEntries(Object.entries(def.targets).map(([n, t]) => {
    const c = /** @type {T.ExactTag | T.ToleranceTag} */ (t.compare);
    return [n, { accepts: t.accepts === "*" ? "*" : [...t.accepts], compare: "figure" in c ? { kind: "tolerance", figure: /** @type {number} */ (c.figure) } : { kind: "exact" } }];
  }));

  /** @type {T.Dialect} */
  const dialect = Object.freeze({
    name: def.name,
    numberType: def.numberType,
    def,
    intrinsics,
    library,
    targets: /** @type {T.Dialect["targets"]} */ (targets),
    libraryFor: (/** @type {string[]} */ sources) => libraryFor(library, sources),
    environment: (/** @type {Record<string, any>} */ program, /** @type {Map<string, unknown>} */ states = new Map()) => environmentOf(def, { vectors, scalars }, componentAliases, program, states),
  });
  MADE.add(dialect);
  return dialect;
}

/**
 * One Program's Environment.
 * @param {T.DialectDef} def @param {{ vectors: Record<string, VecType>, scalars: Record<string, ScalarType> }} named  the types declared in `types`
 * @param {Record<string, Record<string, string>>} componentAliases
 * @param {Record<string, any>} program @param {Map<string, unknown>} states
 * @returns {Environment}
 */
function environmentOf(def, { vectors, scalars }, componentAliases, program, states) {
  /** @type {Record<string, ObjectDecl>} */
  const objects = {};
  /** @type {Resolver} */
  const r = {
    vectors,
    scalars,
    objects: { has: (n) => Object.hasOwn(objects, n) || Object.hasOwn(def.objects ?? {}, n) },
    // An object type made on the spot (a table's row at one step): named by its label, numbered when the
    // label is taken by different members, so equal declarations share one object.
    objectFor(label, members) {
      const decl = { label, members: Object.fromEntries(Object.entries(members).map(([m, t]) => [m, resolveMember(t, r)])) };
      for (let n = 1; ; n++) {
        const key = n === 1 ? label : `${label} #${n}`;
        if (!Object.hasOwn(objects, key)) { objects[key] = decl; return key; }
        if (JSON.stringify(objects[key]) === JSON.stringify(decl)) return key;
      }
    },
  };
  for (const [n, o] of Object.entries(def.objects ?? {})) {
    objects[n] = { label: o.label ?? n, members: Object.fromEntries(Object.entries(o.members ?? {}).map(([m, t]) => [m, resolveMember(t, r)])) };
  }
  /** @type {Record<string, Type>} */
  const globals = Object.fromEntries(Object.entries(def.globals ?? {}).map(([n, t]) => [n, resolveType(t, r)]));
  // An intrinsic is called by name, so it is a global whose type is an object that can be called.
  for (const [n, i] of Object.entries(def.intrinsics ?? {})) {
    objects[n] = { label: n, members: {}, call: intrinsicSig(i, r) };
    globals[n] = { obj: n };
  }
  const added = def.environment ? def.environment(program) : {};
  for (const [n, o] of Object.entries(added.objects ?? {})) {
    const into = (objects[n] ??= { label: o.label ?? n, members: {} });
    for (const [m, t] of Object.entries(o.members ?? {})) {
      if (Object.hasOwn(into.members, m)) throw new Error(`environment(program) declares ${n}.${m} twice: it is already a member of ${n}`);
      // defineProperty, not assignment: a member named __proto__ must be an own member, not a prototype.
      Object.defineProperty(into.members, m, { value: resolveMember(t, r), enumerable: true, writable: true, configurable: true });
    }
  }
  for (const [n, t] of Object.entries(added.globals ?? {})) {
    if (Object.hasOwn(globals, n)) throw new Error(`environment(program) declares the global '${n}' twice`);
    globals[n] = resolveType(t, r);
  }
  /** @type {Map<string, SlotDecl>} */
  const fixed = new Map();
  return {
    name: def.name,
    objects,
    list: Object.fromEntries(Object.entries(def.list ?? {}).map(([n, m]) => [n, resolveMember(m, r)])),
    queries: /** @type {Environment["queries"]} */ ([...(def.queries ?? [])]),
    globals,
    vectors,
    componentAliases,
    numberType: def.numberType,
    conversions: { ...(def.conversions ?? {}) },
    slot(ref) {
      if (ref.kind === "helper") return { params: [], inferParams: true, returns: "infer", space: `helper ${ref.key}`, forbid: [] };
      if (ref.kind === "const") return { params: [], returns: "infer", space: `constant ${ref.key}`, forbid: ALL_EFFECTS, forbidWhy: "a constant is computed once, so it may not call, read or change anything" };
      const c = Object.hasOwn(def.slots, ref.kind) ? def.slots[ref.kind] : undefined;
      if (c === undefined) return `the ${def.name} Dialect has no '${ref.kind}' slot convention`;
      if (typeof c !== "function") {
        let d = fixed.get(ref.kind);
        if (!d) fixed.set(ref.kind, (d = convention(c, r)));
        return d;
      }
      const made = c(ref, program, states.get(ref.id));
      if (typeof made === "string") return made;
      checkConvention(made, def, objects, ref);
      return convention(made, r);
    },
  };
}

/**
 * A convention in the core's terms. Every space is pure and no member can carry an effect, so purity holds
 * by construction and `forbid` stays empty (as fields' pixel convention has it).
 * @param {T.ConventionDef} c @param {Resolver} r
 * @returns {SlotDecl}
 */
function convention(c, r) {
  return { params: c.params.map((p) => resolveType(p, r)), returns: c.returns === "infer" ? "infer" : resolveType(c.returns, r), space: c.space, forbid: [] };
}

/**
 * Checks what a convention function returned, as defineDialect checks a static one.
 * @param {unknown} c @param {T.DialectDef} def @param {Record<string, ObjectDecl>} objects @param {SlotRef} ref
 */
function checkConvention(c, def, objects, ref) {
  /** @type {Problem[]} */
  const out = [];
  // "unknown" is what a lambda that failed to lower returns; a state built from it stays quiet, as lowering does.
  const scope = { types: new Set(Object.keys(def.types ?? {})), objects: new Set([...Object.keys(objects), "unknown"]) };
  if (!isPlainObject(c) || !Array.isArray(c.params) || c.returns === undefined) out.push({ code: "D011", path: ["slots", ref.kind], message: "a convention function must return { params, returns, space } or a reason string.", tip: "return { params: [...], returns: \"infer\", space: \"…\" }" });
  else {
    c.params.forEach((t, i) => checkType(t, scope, {}, ["slots", ref.kind, "params"], `slot convention '${ref.kind}' for ${ref.id}, param ${i + 1}`, out));
    checkType(c.returns, scope, { infer: true }, ["slots", ref.kind, "returns"], `slot convention '${ref.kind}' for ${ref.id}, returns`, out);
    if (typeof c.space !== "string" || !(c.space in def.spaces)) out.push({ code: "D005", path: ["slots", ref.kind, "space"], message: `slot convention '${ref.kind}' for ${ref.id} runs in an undeclared space.`, tip: `space: one of ${Object.keys(def.spaces).join(", ")}` });
  }
  refuse(`the slot convention '${ref.kind}'`, out);
}
