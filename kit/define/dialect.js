// defineDialect: a Dialect definition, checked, to a Dialect value that yields one Program's Environment
// (kit/lower/environment.d.ts, unchanged), the intrinsic table the backends read, and the Library.

import { validateDialect } from "./validate-dialect.js";
import { spaceModel, helpersMay, programProblems, conventionProblems } from "./effects.js";
import { resolveType, resolveMember, intrinsicSig, checkType } from "./types.js";
import { isPlainObject, kindOf, struct } from "./tags.js";
import { callSite } from "./site.js";
import { checkStateValue, stateErrorMessage } from "./state.js";
import { dialectVector, dialectScalar } from "../ir/types.js";
import { declareSeams, checkOutputs, noSeams } from "./ports.js";

/** @import { Type, VecType, ScalarType, EffectVerb } from "../ir/ir.js" */
/** @import { Environment, ObjectDecl, SlotDecl, SlotRef } from "../lower/environment.js" */
/** @import { UnitDecl } from "../dialects/fields/decls.js" */
/** @import * as T from "./define.js" */
/** @import { Problem, Resolver } from "./types.js" */
/** @import { SpaceModel } from "./effects.js" */
/** @typedef {{ members: Record<string, unknown>, records: T.EventRecord[], inputs: T.Seams["inputs"] }} SeamEnv */

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

/**
 * Every effect verb: what a constant may not do (a constant is computed once), as DMG's const convention. A constant
 * cannot reach a bump today (its body is one expression, and a bump used as a value is L017; a helper it calls may
 * not bump), so "bump" here is defense in depth.
 */
const ALL_EFFECTS = /** @type {EffectVerb[]} */ (["read", "input", "hud", "call", "write", "bump", "rng", "emit", "sfx", "toast", "spawn", "destroy", "end", "log"]);

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
  // the seams are judged with the rest, so one refusal lists every problem
  const seamed = isPlainObject(def) ? declareSeams(/** @type {Record<string, any>} */ (def)) : null;
  refuse("defineDialect", [...validateDialect(def), ...(seamed?.problems ?? [])]);
  /** @type {Record<string, VecType>} */
  const vectors = {};
  /** @type {Record<string, ScalarType>} */
  const scalars = {};
  /** @type {Record<string, Record<string, string>>} */
  const componentAliases = {};
  /** @type {Record<string, "scalar">} */
  const vectorMultiply = {};
  for (const [n, v] of Object.entries(def.types ?? {})) {
    // A nominal scalar is a type name only: unlike a vector, a lambda cannot call it to make one.
    if (kindOf(v) === "scalar") { scalars[n] = dialectScalar(n, "f64"); continue; }
    const vec = /** @type {T.VectorTag} */ (v);
    vectors[n] = dialectVector(n, /** @type {2 | 3 | 4} */ (vec.n), /** @type {"f32" | "f64"} */ (vec.elem));
    const aliases = /** @type {{ aliases?: Record<string, string> } | undefined} */ (vec.options)?.aliases;
    if (aliases) componentAliases[n] = { ...aliases };
    if (/** @type {{ multiply?: string } | undefined} */ (vec.options)?.multiply === "scalar") vectorMultiply[n] = "scalar";
  }
  /** @type {Resolver} */
  const statics = { vectors, scalars };
  const spaces = spaceModel(/** @type {Record<string, any>} */ (def));
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

  // The run's state (not a construct's): its core Type, a value check by path, and a text view that applies it.
  const stateType = def.state === undefined ? undefined : resolveType(struct(def.state), statics);
  const checkState = stateType && ((/** @type {unknown} */ v) => checkStateValue(stateType, v));
  const seams = seamed?.seams ?? noSeams();
  refuse("defineDialect", checkOutputs(seams, /** @type {Record<string, any>} */ (def), stateType));
  /** @type {SeamEnv} */
  const seamEnv = { members: seamed?.members ?? {}, records: seamed?.records ?? [], inputs: seams.inputs };
  const text = checkState
    ? (/** @type {unknown} */ s) => {
      const bad = checkState(s);
      if (bad.length) throw new Error(stateErrorMessage(def.name, bad));
      return def.text(s);
    }
    : def.text;

  /** @type {T.Dialect} */
  const dialect = Object.freeze({
    name: def.name,
    numberType: def.numberType,
    def,
    intrinsics,
    library,
    targets: /** @type {T.Dialect["targets"]} */ (targets),
    libraryFor: (/** @type {string[]} */ sources) => libraryFor(library, sources),
    text,
    ...(stateType ? { state: def.state, stateType, checkState } : {}),
    seams,
    site: callSite(),
    environment: (/** @type {Record<string, any>} */ program, /** @type {Map<string, unknown>} */ states = new Map()) => environmentOf(def, { vectors, scalars }, componentAliases, vectorMultiply, program, states, spaces, seamEnv),
  });
  MADE.add(dialect);
  return dialect;
}

/**
 * One Program's Environment.
 * @param {T.DialectDef} def @param {{ vectors: Record<string, VecType>, scalars: Record<string, ScalarType> }} named  the types declared in `types`
 * @param {Record<string, Record<string, string>>} componentAliases
 * @param {Record<string, "scalar">} vectorMultiply  the vectors that multiply only by a scalar
 * @param {Record<string, any>} program @param {Map<string, unknown>} states
 * @param {SpaceModel} spaces  each space's instance object, or null when it is pure
 * @param {SeamEnv} seamEnv  the value inputs' members, and each Event input's record object
 * @returns {Environment}
 */
function environmentOf(def, { vectors, scalars }, componentAliases, vectorMultiply, program, states, spaces, seamEnv) {
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
    objects[n] = { label: o.label ?? n, members: Object.fromEntries(Object.entries(o.members ?? {}).map(([m, t]) => [m, resolveMember(t, r, `${n}.${m}`)])) };
    if (o.rejected) objects[n].rejected = Object.fromEntries(Object.entries(o.rejected).map(([m, r]) => [m, { message: r.message, tip: r.tip ?? (r.fix ? `write ${r.fix}` : "") }]));
    if (o.call) objects[n].call = { ...intrinsicSig(/** @type {any} */ (o.call), r), effects: /** @type {import("../ir/ir.js").Effect[]} */ ([...(o.effects ?? [])]) };
  }
  /** @type {Record<string, Type>} */
  const globals = Object.fromEntries(Object.entries(def.globals ?? {}).map(([n, t]) => [n, resolveType(t, r)]));
  // An intrinsic is called by name, so it is a global whose type is an object that can be called.
  for (const [n, i] of Object.entries(def.intrinsics ?? {})) {
    objects[n] = { label: n, members: {}, call: intrinsicSig(i, r) };
    globals[n] = { obj: n };
  }
  const added = def.environment ? def.environment(program) : {};
  // What a Program added can break an effect rule the definition alone could not (a may naming a member it lacks).
  if (def.environment) refuse("environment(program)", programProblems(/** @type {Record<string, any>} */ (def), added));
  for (const [n, o] of Object.entries(added.objects ?? {})) {
    const into = (objects[n] ??= { label: o.label ?? n, members: {} });
    for (const [m, t] of Object.entries(o.members ?? {})) {
      if (Object.hasOwn(into.members, m)) refuse("environment(program)", [{ code: "D007", path: ["environment"], message: `environment(program) declares ${n}.${m} twice: it is already a member of ${n}.`, tip: `add only members ${n} does not declare, or drop ${m} from ${n}'s members` }]);
      // defineProperty, not assignment: a member named __proto__ must be an own member, not a prototype.
      Object.defineProperty(into.members, m, { value: resolveMember(t, r, `${n}.${m}`), enumerable: true, writable: true, configurable: true });
    }
  }
  for (const [n, t] of Object.entries(added.globals ?? {})) {
    if (Object.hasOwn(globals, n)) refuse("environment(program)", [{ code: "D007", path: ["environment"], message: `environment(program) declares the global '${n}' twice: the Dialect already has it.`, tip: `give the global another name: the Dialect already declares '${n}'` }]);
    globals[n] = resolveType(t, r);
  }
  // the value inputs, as members of the object the Dialect names for them (it declares it empty)
  if (seamEnv.inputs && Object.hasOwn(objects, seamEnv.inputs.object)) {
    const into = objects[seamEnv.inputs.object];
    for (const [m, t] of Object.entries(seamEnv.members)) Object.defineProperty(into.members, m, { value: resolveMember(t, r), enumerable: true, writable: true, configurable: true });
  }
  // each Event input's record: an object of read-only fields whose every read is `read <name>.<field>`, so only
  // the slots its record names (which may read it) see it; any other lambda's read is L004
  /** @type {Map<string, string[]>} */
  const recordReads = new Map();
  for (const rec of seamEnv.records) {
    objects[rec.name] = { label: `the ${rec.input} record (${rec.name})`, members: Object.fromEntries(Object.entries(rec.members).map(([m, t]) => [m, { kind: /** @type {const} */ ("value"), t: resolveType(t, r), effect: /** @type {import("../ir/ir.js").Effect} */ (`read ${rec.name}.${m}`) }])) };
    globals[rec.name] = { obj: rec.name };
    for (const s of rec.slots) recordReads.set(s, [...(recordReads.get(s) ?? []), `read ${rec.name}`]);
  }
  /** A convention, with the records its slot sees added to what it may read. @param {SlotDecl} d @param {string} kind @returns {SlotDecl} */
  const seeing = (d, kind) => (recordReads.has(kind) ? { ...d, may: [...(d.may ?? []), .../** @type {string[]} */ (recordReads.get(kind))] } : d);
  /** @type {Map<string, SlotDecl>} */
  const fixed = new Map();
  const helperMay = helpersMay(/** @type {Record<string, any>} */ (def), spaces);
  return {
    name: def.name,
    objects,
    list: Object.fromEntries(Object.entries(def.list ?? {}).map(([n, m]) => [n, resolveMember(m, r)])),
    queries: /** @type {Environment["queries"]} */ ([...(def.queries ?? [])]),
    globals,
    vectors,
    componentAliases,
    ...(Object.keys(vectorMultiply).length ? { vectorMultiply } : {}),
    ...(def.conditions ? { conditions: def.conditions } : {}),
    ...(def.helpers?.check === "all" ? { checkAllHelpers: true } : {}),
    numberType: def.numberType,
    conversions: { ...(def.conversions ?? {}) },
    slot(ref) {
      if (ref.kind === "helper") return { params: [], inferParams: true, returns: "infer", space: `helper ${ref.key}`, forbid: [], may: [...helperMay] };
      if (ref.kind === "const") return constConvention(ref.key, def.constants?.calls ?? "none");
      const c = Object.hasOwn(def.slots, ref.kind) ? def.slots[ref.kind] : undefined;
      if (c === undefined) return `the ${def.name} Dialect has no '${ref.kind}' slot convention`;
      if (typeof c !== "function") {
        let d = fixed.get(ref.kind);
        if (!d) fixed.set(ref.kind, (d = seeing(convention(c, r, spaces), ref.kind)));
        return d;
      }
      const made = c(ref, program, states.get(ref.id));
      if (typeof made === "string") return made;
      checkConvention(made, def, objects, ref, added);
      return seeing(convention(made, r, spaces), ref.kind);
    },
  };
}

/**
 * The kit's `const` convention. A constant is computed once, so it reads and changes nothing; with
 * `calls: "pure"` it may call a helper. Lowering lists a callee's effects beside the call, so a helper that reads
 * something that changes (a writable member, a total) is refused here by this forbid list.
 * @param {string | undefined} key @param {T.ConstantCalls} calls
 * @returns {SlotDecl}
 */
function constConvention(key, calls) {
  const space = `constant ${key}`;
  if (calls === "pure") return { params: [], returns: "infer", space, forbid: ALL_EFFECTS.filter((v) => v !== "call"), forbidWhy: "a constant is computed once, so it may call only pure helpers and may not read or change anything" };
  return { params: [], returns: "infer", space, forbid: ALL_EFFECTS, forbidWhy: "a constant is computed once, so it may not call, read or change anything" };
}

/**
 * A convention in the core's terms. What its lambda may do is `may`, an allow-list (absent, nothing), plus a read of
 * its instance in an instance space; `forbid` stays empty (as fields' pixel convention has it).
 * @param {T.ConventionDef} c @param {Resolver} r @param {SpaceModel} spaces
 * @returns {SlotDecl}
 */
function convention(c, r, spaces) {
  const instance = spaces[c.space] ?? null;
  return {
    params: c.params.map((p) => resolveType(p, r)), returns: c.returns === "infer" ? "infer" : resolveType(c.returns, r), space: c.space, forbid: [],
    may: [...(c.may ?? []), ...(instance ? [`read ${instance}`] : [])],
    ...(c.body ? { body: c.body } : {}),
  };
}

/**
 * Checks what a convention function returned, as defineDialect checks a static one.
 * @param {unknown} c @param {T.DialectDef} def @param {Record<string, ObjectDecl>} objects @param {SlotRef} ref
 * @param {Record<string, any>} added  what environment(program) returned, for its members' effect flags
 */
function checkConvention(c, def, objects, ref, added) {
  /** @type {Problem[]} */
  const out = [];
  // "unknown" is what a lambda that failed to lower returns; a state built from it stays quiet, as lowering does.
  const scope = { types: new Set(Object.keys(def.types ?? {})), objects: new Set([...Object.keys(objects), "unknown"]) };
  if (!isPlainObject(c) || !Array.isArray(c.params) || c.returns === undefined) out.push({ code: "D011", path: ["slots", ref.kind], message: "a convention function must return { params, returns, space } or a reason string.", tip: "return { params: [...], returns: \"infer\", space: \"…\" }" });
  else {
    c.params.forEach((t, i) => checkType(t, scope, {}, ["slots", ref.kind, "params"], `slot convention '${ref.kind}' for ${ref.id}, param ${i + 1}`, out));
    checkType(c.returns, scope, { infer: true }, ["slots", ref.kind, "returns"], `slot convention '${ref.kind}' for ${ref.id}, returns`, out);
    if (c.body !== undefined && c.body !== "block") out.push({ code: "D011", path: ["slots", ref.kind, "body"], message: `slot convention '${ref.kind}' for ${ref.id}: body must be "block", not ${JSON.stringify(c.body)}.`, tip: `body: "block" refuses an expression body` });
    if (typeof c.space !== "string" || !(c.space in def.spaces)) out.push({ code: "D005", path: ["slots", ref.kind, "space"], message: `slot convention '${ref.kind}' for ${ref.id} runs in an undeclared space.`, tip: `space: one of ${Object.keys(def.spaces).join(", ")}` });
    else out.push(...conventionProblems(c, `slot convention '${ref.kind}' for ${ref.id}`, ["slots", ref.kind], /** @type {Record<string, any>} */ (def), added));
  }
  refuse(`the slot convention '${ref.kind}'`, out);
}
