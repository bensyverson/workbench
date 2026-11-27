// defineGrammar: a Grammar definition, checked, to the generated root builder. Each construct instance's
// builder has its slots, its child constructs and (forwarded) its ancestors' methods; an unknown method
// throws B001 at once, everything else is collected with the call site and thrown by `.build()`.

import { validateGrammar, KIT_METHODS, PROBES as PROBE_LIST, OBJECT_PROBES, scopedNamespaces } from "./validate-grammar.js";
import { refuse, isDialect } from "./dialect.js";
import { didYouMean, dialectError, an } from "./codes.js";
import { TAG, kindOf } from "./tags.js";
import { callSite } from "./site.js";
import { GRAMMARS, REPLACED } from "./sites.js";
import { lambdaSource, constSource, found, where } from "./shapes.js";
import { recordOf, matchArgs, openKey, instanceName } from "./record.js";
import { freeNames, paramNames } from "./free.js";
import { lowerRecord } from "./lower.js";
import { unitOf, PLAIN } from "./scope.js";
import { noteRoot, noteCall, noteConvention, misfit } from "./params.js";
import { sideOf, paramSideOf } from "./handles.js";
import { INPUTS_NS } from "./validate-grammar.js";
import { buildTimeShadows } from "../parse/toplevel.js";

/** @import * as T from "./define.js" */
/** @import { Found } from "./shapes.js" */
/** @import { Loc, ArrowFunctionExpression } from "../parse/ast.js" */
/** @import { Construct, Instance, Call } from "./record.js" */

/** A Program the builder refuses: every diagnostic, the first one's code. */
export class BuildError extends Error {
  /** @param {T.BuildDiagnostic[]} diagnostics */
  constructor(diagnostics) {
    super(diagnostics.map((d) => `${d.code} ${d.file.replace(/^.*\//, "")}:${d.loc.start.line}:${d.loc.start.column + 1} ${d.message}${d.tip ? `\n  tip: ${d.tip}` : ""}`).join("\n"));
    this.name = "BuildError";
    this.diagnostics = diagnostics;
    this.diagnostic = diagnostics[0];
    this.code = diagnostics[0]?.code;
  }
}

/** The key a builder answers with its Program, for run(). */
const PROGRAM = Symbol("program");

/**
 * The Program behind a builder, or undefined for anything else.
 * @param {unknown} b
 * @returns {Program | undefined}
 */
export const programOf = (b) => (b !== null && typeof b === "object" ? /** @type {any} */ (b)[PROGRAM] : undefined);

/** Properties a runtime or test library probes on any object; they are not method calls. */
const PROBES = new Set(PROBE_LIST);
/** The namespace unit names (.fn, .const) declare into, beside the Dialect's own names. */
const UNITS = "\0unit";
/** The namespace every stateful construct instance's name is in, whatever its construct. */
const STATES = "\0state";
/** JavaScript globals a lambda author may reach for; B008's tip for one differs from a Program name's. */
const JS_GLOBALS = new Set(["Math", "Number", "JSON", "console", "Object", "Array", "String", "Boolean", "Date", "BigInt", "Symbol", "Reflect", "Intl", "globalThis", "window", "document", "process"]);
const IDENT = /^[A-Za-z_$][\w$]*$/;
/** JavaScript's value globals, which a lambda may not read unless its Dialect declares them, and what to use instead. */
const VALUE_GLOBALS = /** @type {Record<string, string>} */ ({ Infinity: "a large finite number (a top-level constant such as const BIG = 1e9)", NaN: "a finite number", undefined: "a value of the type expected" });

/**
 * @param {string} code @param {string} message @param {string} tip @param {{ file: string, loc: Loc }} at @param {Partial<T.BuildDiagnostic>} [extra]
 * @returns {T.BuildDiagnostic}
 */
const diag = (code, message, tip, at, extra = {}) => ({ code, severity: "error", message, tip, loc: at.loc, range: [0, 0], file: at.file, ...extra });

/**
 * A unit with the keyword its declaration used, when the host said it.
 * @param {{ name: string, kind: "fn" | "const", src: string }} unit @param {Record<string, "const" | "let" | "function">} [keywords]
 */
const keyed = (unit, keywords) => (keywords && Object.hasOwn(keywords, unit.name) ? { ...unit, keyword: keywords[unit.name] } : unit);

/**
 * @param {T.Dialect} dialect @param {T.GrammarDef} def
 * @returns {((...args: unknown[]) => any) & { dialect: T.Dialect, grammar: T.GrammarDef, lower: (record: Record<string, any>) => import("./lower.js").Lowered }}
 */
export function defineGrammar(dialect, def) {
  refuse("defineGrammar", validateGrammar(isDialect(dialect) ? dialect : null, def));
  /** @type {Record<string, Construct>} */
  const cs = {};
  for (const [n, c] of Object.entries(def.constructs)) cs[n] = { name: n, def: c, parent: null, children: [], rejected: {} };
  for (const c of Object.values(cs)) if (c.def.parent) { c.parent = cs[c.def.parent]; c.parent.children.push(c); }
  for (const c of Object.values(cs)) for (let a = /** @type {Construct | null} */ (c); a; a = a.parent) c.rejected = { ...(a.def.rejected ?? {}), ...c.rejected };
  /** @type {Compiled} */
  const g = { dialect, def: /** @type {Record<string, any>} */ (def), constructs: cs, root: cs[def.root], scoped: scopedNamespaces(def.constructs) };
  noteConvention(dialect.def.params);
  const builder = (/** @type {unknown[]} */ ...args) => new Program(g).open(g.root, null, args, callSite());
  return Object.assign(builder, {
    dialect,
    grammar: def,
    /** Lowers every Runtime Lambda of a record: see lower.js. @param {Record<string, any>} record */
    lower: (record) => lowerRecord(g, record),
  });
}

/**
 * A host's mistake in `.check(options)` / `.build(options)` throws: it is not the Program's.
 * @param {unknown} o
 */
function checkOptions(o) {
  const x = /** @type {Record<string, unknown>} */ (o);
  const keys = "{ scope?, sources?, buildTime?, buildTimeBindings?, keywords?, shadowed?, file? }";
  if (x === null || typeof x !== "object" || Array.isArray(x)) throw new TypeError(`build(options) and check(options) take ${keys}`);
  for (const k of Object.keys(x)) if (!["scope", "sources", "buildTime", "buildTimeBindings", "keywords", "shadowed", "file"].includes(k)) throw new TypeError(`build(options): unknown key '${k}'; it takes ${keys}`);
  if (x.keywords !== undefined && (x.keywords === null || typeof x.keywords !== "object" || Array.isArray(x.keywords) || !Object.values(x.keywords).every((w) => w === "const" || w === "let" || w === "function"))) throw new TypeError("build({ keywords }): keywords is an object of each top-level binding's keyword, \"const\", \"let\" or \"function\", by name");
  if (x.shadowed !== undefined && !(Array.isArray(x.shadowed) && x.shadowed.every((n) => typeof n === "string"))) throw new TypeError("build({ shadowed }): shadowed is a list of names");
  if (x.file !== undefined && typeof x.file !== "string") throw new TypeError("build({ file }): file is the module's source text, the text moduleScope was given");
  if (x.scope !== undefined && (x.scope === null || typeof x.scope !== "object" || Array.isArray(x.scope))) throw new TypeError("build({ scope }): scope is an object of the file's top-level bindings, by name");
  if (x.sources !== undefined && (x.sources === null || typeof x.sources !== "object" || Array.isArray(x.sources) || !Object.values(x.sources).every((s) => typeof s === "string"))) throw new TypeError("build({ sources }): sources is an object of each top-level declaration's initializer text, by name");
  if (x.buildTime !== undefined && !(Array.isArray(x.buildTime) && x.buildTime.every((n) => typeof n === "string"))) throw new TypeError("build({ buildTime }): buildTime is a list of names");
  if (x.buildTimeBindings !== undefined && !(Array.isArray(x.buildTimeBindings) && x.buildTimeBindings.every((n) => typeof n === "string"))) throw new TypeError("build({ buildTimeBindings }): buildTimeBindings is a list of names");
}

/** @typedef {{ dialect: T.Dialect, def: Record<string, any>, constructs: Record<string, Construct>, root: Construct, scoped: Map<string, string> }} Compiled */

/**
 * B004's tip and fix when a lambda of no parameters stands where a value goes: pass its value, which build-time
 * code computes (a param read there is a plain value), `.limit($.topN)` for `.limit(() => $.topN)`.
 * @param {{ code: string, path: Array<string | number> }} e @param {unknown[]} args @param {string} slot
 * @returns {{ tip?: string, fix?: string }}
 */
function valueNotLambda(e, args, slot) {
  const v = e.code === "B004" && e.path.length === 1 ? args[/** @type {number} */ (e.path[0])] : undefined;
  if (typeof v !== "function") return {};
  const r = lambdaSource(v);
  if ("error" in r || r.ast.params.length || r.ast.body.type === "BlockStatement") return {};
  const fix = `.${slot}(${r.src.slice(r.ast.body.range[0], r.ast.body.range[1])})`;
  return { fix, tip: `pass the value, not a lambda: build-time code reads a param as a plain value, ${fix}` };
}

/**
 * The names in a Dialect's types a lambda can call: its vectors (constructors). A nominal scalar is a type
 * name only, so calling it is B008.
 * @param {Record<string, unknown> | undefined} types
 */
const callableTypes = (types) => Object.entries(types ?? {}).filter(([, v]) => kindOf(v) !== "scalar").map(([n]) => n);

class Program {
  /** @param {Compiled} g */
  constructor(g) {
    this.g = g;
    /** @type {T.BuildDiagnostic[]} */
    this.diagnostics = [];
    /** @type {Map<string, Set<string>>} */
    this.names = new Map([[INPUTS_NS, new Set(Object.keys(g.dialect.seams?.in ?? {}))], [UNITS, new Set([...Object.keys(g.dialect.def.intrinsics ?? {}), ...g.dialect.library.map((u) => u.name), ...Object.keys(g.dialect.def.globals ?? {}), ...callableTypes(g.dialect.def.types), ...Object.keys(g.dialect.def.conversions ?? {})])]]);
    /** The names of each namespace a `within` scopes, per instance of its `within` construct. @type {WeakMap<Instance, Map<string, Set<string>>>} */
    this.scopedNames = new WeakMap();
    /** @type {Instance | null} */
    this.root = null;
    /** @type {Array<{ ast: ArrowFunctionExpression, src: string, what: string, at: { file: string, loc: Loc } }>} */
    this.sources = [];
    /** The text of each Runtime Lambda handed to a slot as a function (not as text), for the shadow scan. @type {string[]} */
    this.handed = [];
  }

  /**
   * Opens a construct instance under `parent` and returns its builder.
   * @param {Construct} c @param {Instance | null} parent @param {unknown[]} args @param {{ file: string, loc: Loc }} at
   */
  open(c, parent, args, at) {
    if (parent) noteCall(this, `${c.name} ${JSON.stringify(typeof args[0] === "string" ? args[0] : c.name)}`);
    else noteRoot(this, typeof args[0] === "string" ? `${c.name} '${args[0]}'` : c.name, at);
    const specs = /** @type {T.Tagged[]} */ (c.def.opens ?? []);
    const { args: made, found: f } = matchArgs(specs, args);
    /** @type {Record<string, unknown>} */
    const opened = {};
    specs.forEach((s, i) => { if (i < made.length) opened[openKey(s, i)] = made[i]; });
    /** @type {Instance} */
    const inst = { construct: c, opened, parent, children: [], calls: [], loc: at.loc, file: at.file };
    this.report(f.errors.filter((e) => !this.knockOn(e, inst, "")), c.name, at);
    let named = true;
    specs.forEach((s, i) => { if (s[TAG] === "name" && typeof made[i] === "string") named = this.declare(/** @type {T.NameTag} */ (s), inst, made[i], at, parent === null) && named; });
    // a name its namespace refused already is one mistake: the state namespace would only say it again
    if (c.def.state && named) this.declareState(c, instanceName(inst), at);
    /** @type {Call} */
    const call = { slot: "(opens)", args: made, loc: at.loc, file: at.file, found: f };
    this.track(call, at);
    /** @type {any} */ (inst).openCall = call;
    if (parent) parent.children.push(inst); else this.root = inst;
    return this.builder(inst);
  }

  /** @param {Found["errors"]} errors @param {string} what @param {{ file: string, loc: Loc }} at */
  report(errors, what, at) {
    for (const e of errors) this.diagnostics.push(diag(e.code, `${what}: ${e.message}`, e.tip ?? (e.code === "B007" ? "pass an arrow function, (x) => …, or its source text" : "pass a value of the shape the slot declares"), at, { arg: e.path.length === 1 ? /** @type {number} */ (e.path[0]) : e.path, ...(e.lambda ? { lambda: e.lambda } : {}), ...(e.severity ? { severity: e.severity } : {}), ...(/** @type {{ fix?: string }} */ (e).fix ? { fix: /** @type {{ fix?: string }} */ (e).fix } : {}) }));
  }

  /**
   * Declares a name; B002 when its namespace has it. Returns whether it was declared.
   * @param {T.NameTag | null} spec  null for a unit
   * @param {Instance} inst  the instance the call is on (or the one being opened)
   * @param {string} value @param {{ file: string, loc: Loc }} at
   * @param {boolean} [label]  the root's opening name, the Program's own name, so any non-empty string (`domain-warp`)
   */
  declare(spec, inst, value, at, label = false) {
    const ns = spec === null ? UNITS : typeof spec.ns === "string" ? spec.ns : inst.construct.name;
    if (label ? value.trim() === "" : !IDENT.test(value)) { this.diagnostics.push(diag("B004", `${label ? "an empty name" : `'${value}' is not a name: a name is an identifier`}`, "use letters, digits, _ and $, not starting with a digit", at)); return false; }
    const { set, owner } = this.namespace(ns, inst);
    if (set.has(value)) {
      const dialect = spec === null && this.g.dialect.library.some((u) => u.name === value) ? "the Library" : spec === null && this.ownNames().has(value) ? `the ${this.g.dialect.name} Dialect` : null;
      const within = owner ? ` in ${owner.construct.name} '${instanceName(owner)}'` : "";
      this.diagnostics.push(diag("B002", dialect ? `'${value}' is already defined by ${dialect}; a second one would replace it${dialect === "the Library" ? " inside the Library too" : ""}` : `'${value}' is already declared${ns === UNITS ? " as a helper or constant" : ` as ${an(ns)}${within}`}`, `rename it`, at));
      return false;
    }
    set.add(value);
    return true;
  }

  /**
   * The names declared so far in a namespace, as seen from an instance: the whole Program's, or for a namespace
   * a `within` scopes, those of the nearest enclosing instance of that construct (`owner`, the instance itself
   * included; null when none encloses it).
   * @param {string} ns @param {Instance} inst
   * @returns {{ set: Set<string>, owner: Instance | null }}
   */
  namespace(ns, inst) {
    const within = this.g.scoped.get(ns);
    if (within === undefined) {
      const set = this.names.get(ns) ?? new Set();
      this.names.set(ns, set);
      return { set, owner: null };
    }
    let owner = /** @type {Instance | null} */ (inst);
    while (owner && owner.construct.name !== within) owner = owner.parent;
    if (!owner) return { set: new Set(), owner: null };
    const byNs = this.scopedNames.get(owner) ?? new Map();
    this.scopedNames.set(owner, byNs);
    const set = byNs.get(ns) ?? new Set();
    byNs.set(ns, set);
    return { set, owner };
  }

  /**
   * Declares a stateful instance's name; B002 when another stateful instance has it, since stateOf(name) and
   * `states` find an instance by name alone.
   * @param {Construct} c @param {string} value @param {{ file: string, loc: Loc }} at
   */
  declareState(c, value, at) {
    const set = this.names.get(STATES) ?? new Set();
    this.names.set(STATES, set);
    if (set.has(value)) this.diagnostics.push(diag("B002", `'${value}' already names a construct with state; stateOf('${value}') could not tell the two apart`, `rename this ${c.name}`, at));
    else set.add(value);
  }

  /**
   * Whether a shape's B004 for a number that is not finite is said better elsewhere, so one mistake is one
   * diagnostic: a param's declared value is held to its declaration below, which names the param; and a value
   * that is a refused declared value (`$` answers it) is that refusal's knock-on.
   * @param {Found["errors"][number]} e @param {Instance} inst @param {string} slot
   */
  knockOn(e, inst, slot) {
    if (!e.finite) return false;
    const param = inst === this.root && slot === this.paramSlot();
    if (param && e.path.length === 2 && e.path[0] === 1 && e.path[1] === "value") return true;
    return [...this.declared().values()].some((d) => d !== null && typeof d === "object" && Object.is(/** @type {{ value?: unknown }} */ (d).value, e.value));
  }

  /** The params declared so far, by name: each declaration, its `value` the default (for run). */
  declared() {
    const slot = this.paramSlot();
    /** @type {Map<string, unknown>} */
    const out = new Map();
    for (const c of this.root?.calls ?? []) if (slot !== undefined && c.slot === slot && typeof c.args[0] === "string") out.set(c.args[0], c.args[1]);
    return out;
  }

  /**
   * Puts the host's values into the params' declarations, so the record says what was built (run checked them).
   * @param {Record<string, unknown>} values
   */
  useValues(values) {
    const slot = this.paramSlot();
    for (const c of this.root?.calls ?? []) {
      const [n, decl] = c.args;
      if (slot !== undefined && c.slot === slot && typeof n === "string" && Object.hasOwn(values, n) && decl !== null && typeof decl === "object") c.args = [n, { ...decl, value: values[n] }, ...c.args.slice(2)];
    }
  }

  /** The root slot that declares params, if the Grammar names one. @returns {string | undefined} */
  paramSlot() { return this.g.def.params?.slot; }

  /** The Dialect's params convention. */
  dialectParams() { return this.g.dialect.def.params; }

  /** The Dialect's own names, which units may not take. */
  ownNames() {
    const d = this.g.dialect.def;
    return new Set([...Object.keys(d.intrinsics ?? {}), ...Object.keys(d.globals ?? {}), ...Object.keys(d.types ?? {}), ...Object.keys(d.conversions ?? {})]);
  }

  /** Remembers a call's lambdas for the free-name rule. @param {Call} call @param {{ file: string, loc: Loc }} at */
  track(call, at) {
    for (const l of call.found.lambdas) this.sources.push({ ast: l.ast, src: l.src, what: `the ${l.convention} lambda${l.key ? ` '${l.key}'` : ""}`, at });
    for (const l of call.found.lambdas) if (l.given === "function") this.handed.push(l.src);
  }

  /**
   * A builder method call: a slot of `inst`.
   * @param {Instance} inst @param {string} slot @param {unknown[]} args
   */
  call(inst, slot, args) {
    const at = callSite();
    const c = inst.construct;
    const s = c.def.slots[slot];
    const what = `${c.name} '${instanceName(inst)}'`;
    // the call the build-time reads made since the last one land on: in a record: "calls" construct its index, as
    // its lambdas' ids have it; elsewhere the count of this slot's earlier calls
    const nth = c.def.record === "calls" ? inst.calls.length : inst.calls.filter((x) => x.slot === slot).length;
    noteCall(this, `${instanceName(inst)}.${slot}${s.once ? "" : `#${nth}`}`);
    if (s.once && inst.calls.some((x) => x.slot === slot)) {
      this.diagnostics.push(diag("B006", `${what} already has ${an(slot)}: .${slot}(…) may be called once`, `remove the second .${slot}(…)`, at));
      return;
    }
    const before = this.diagnostics.length;
    /** @type {Call} */
    let call;
    if (s.kind === "unit") {
      const [n, src] = args;
      if (typeof n !== "string") { this.diagnostics.push(diag("B004", `${what}: .${slot}(name, source) takes the name as a string, not ${typeof n}`, `.${slot}("name", …)`, at)); return; }
      this.declare(null, inst, n, at);
      const r = s.unit === "fn" ? lambdaSource(src) : constSource(src);
      if ("error" in r) { this.diagnostics.push(diag("B007", `${what}: .${slot}('${n}'): ${r.error}`, s.unit === "fn" ? `.${slot}("${n}", (x) => …)` : `.${slot}("${n}", "0.5")`, at, /** @type {{ src?: string, loc?: Loc }} */ (r).src !== undefined ? { lambda: { src: /** @type {string} */ (/** @type {any} */ (r).src), ...(/** @type {any} */ (r).loc ? { loc: /** @type {any} */ (r).loc } : {}) } } : {})); return; }
      call = { slot, args: [n, r.src], loc: at.loc, file: at.file, found: found() };
      this.sources.push({ ast: r.ast, src: r.src, what: `the ${s.unit === "fn" ? "helper" : "constant"} '${n}'`, at });
      if (s.unit === "fn" && typeof src === "function") this.handed.push(r.src);
    } else {
      const specs = /** @type {T.Tagged[]} */ (s.args);
      const m = matchArgs(specs, args);
      m.found.errors = m.found.errors.filter((e) => !this.knockOn(e, inst, slot));
      for (const e of m.found.errors) Object.assign(e, valueNotLambda(e, args, slot));
      this.report(m.found.errors, `${what}, .${slot}`, at);
      if (inst === this.root && slot === this.paramSlot() && typeof args[0] === "string" && PROBES.has(args[0]) && !OBJECT_PROBES.includes(args[0])) {
        const via = this.dialectParams()?.name ?? "$";
        this.diagnostics.push(diag("B004", `${what}, .${slot}: '${args[0]}' cannot name a param: runtimes and test libraries probe it on every object, so ${via}.${args[0]} would not read the param`, `rename the param, .${slot}("${args[0]}Value", …)`, at, { arg: 0 }));
      }
      specs.forEach((sp, i) => { if (sp[TAG] === "name" && typeof m.args[i] === "string") this.declare(/** @type {T.NameTag} */ (sp), inst, /** @type {string} */ (m.args[i]), at); else if (sp[TAG] === "name" && i < args.length) this.diagnostics.push(diag("B004", `${what}, .${slot}: argument ${i + 1} must be a name (a string), not ${typeof args[i]}`, `.${slot}("name", …)`, at)); });
      call = { slot, args: m.args, loc: at.loc, file: at.file, found: m.found };
      this.track(call, at);
    }
    inst.calls.push(call);
    if (!this.diagnostics.slice(before).some((d) => d.severity === "error") && typeof s.check === "function") {
      s.check({ slot, args: call.args }, this.context(at, call.args, this.record()));
    }
    // A param's declared value is held to its own declaration, as run() holds a host value; a Dialect's check
    // that refused the call already (fields' F001 for a value outside its range) says it more precisely.
    const [n, decl] = call.args;
    if (inst === this.root && slot === this.paramSlot() && decl !== null && typeof decl === "object" && !this.diagnostics.slice(before).some((d) => d.severity === "error")) {
      const why = misfit(/** @type {Record<string, unknown>} */ (decl).value, /** @type {Record<string, unknown>} */ (decl));
      if (why) this.diagnostics.push(diag("B004", `${what}, .${slot}: '${n}' ${why}, the value its declaration gives it`, "make the declared value fit its own declaration: a finite number, inside min..max, one of options", at, { arg: 1 }));
    }
  }

  /**
   * The `ctx` a check receives.
   * @param {{ file: string, loc: Loc }} at @param {unknown[]} args @param {Record<string, unknown>} program
   */
  context(at, args, program) {
    return {
      program,
      state: undefined,
      /** @param {string} code @param {string} message @param {T.ErrorOptions | string} [o]  options, or a tip */
      error: (code, message, o = {}) => {
        const d = dialectError("check", code, message, typeof o === "string" ? { tip: o } : o, args);
        this.diagnostics.push({ ...d, loc: at.loc, range: [0, 0], file: at.file });
      },
    };
  }

  /** The record so far. */
  record() {
    const r = recordOf(/** @type {Instance} */ (this.root));
    GRAMMARS.set(r, this.g);
    const replaced = REPLACED.get(this);
    if (replaced) REPLACED.set(r, replaced);
    return r;
  }

  /**
   * Every diagnostic: those collected at the calls, then the Program-wide ones (B003, B005, B008, construct checks,
   * module scope), and the units the scope's bindings resolved to.
   * @param {T.BuildOptions} [options]
   * @returns {{ diagnostics: T.BuildDiagnostic[], units: Array<{ name: string, kind: "fn" | "const", src: string }> }}
   */
  analyze(options = {}) {
    checkOptions(options);
    const saved = this.diagnostics;
    this.diagnostics = [...saved];
    try {
      const record = this.record();
      // The units come first so the root's check can read them; their diagnostics still follow the checks'.
      const mark = this.diagnostics.length;
      const units = this.checkFreeNames(record, options);
      const free = this.diagnostics.splice(mark);
      const seen = units.length ? { ...record, units: [...units, .../** @type {unknown[]} */ (record.units ?? [])] } : record;
      for (const inst of this.instances()) this.checkInstance(inst, record, inst === this.root ? seen : record);
      this.diagnostics.push(...free);
      return { diagnostics: this.diagnostics, units };
    } finally { this.diagnostics = saved; }
  }

  /**
   * The record, with the units the scope resolved under the root's `units`.
   * @param {T.BuildOptions} [options]
   */
  build(options) {
    const { diagnostics, units } = this.analyze(options);
    if (diagnostics.some((x) => x.severity === "error")) throw new BuildError(diagnostics);
    const record = this.record();
    // first, so a Program constant may read a top-level one (a constant sees only those before it)
    if (units.length) record.units = [...units, .../** @type {unknown[]} */ (record.units ?? [])];
    return record;
  }

  /** Every instance, root first, depth first. */
  instances() {
    /** @type {Instance[]} */
    const out = [];
    const walk = (/** @type {Instance} */ i) => { out.push(i); i.children.forEach(walk); };
    walk(/** @type {Instance} */ (this.root));
    return out;
  }

  /**
   * @param {Instance} inst @param {Record<string, unknown>} record
   * @param {Record<string, unknown>} [seen]  the record the construct's check is handed: the whole record, plus the units for the root
   */
  checkInstance(inst, record, seen = record) {
    const c = inst.construct;
    const what = `${c.name} '${instanceName(inst)}'`;
    const at = { file: inst.file, loc: inst.loc };
    for (const [sn, s] of Object.entries(/** @type {Record<string, any>} */ (c.def.slots ?? {}))) {
      if (s.required && !inst.calls.some((x) => x.slot === sn)) this.diagnostics.push(diag("B005", `${what} has no ${sn}`, `add .${sn}(…)`, at));
    }
    for (const child of c.children) {
      if (child.def.required === true && !inst.children.some((i) => i.construct === child)) this.diagnostics.push(diag("B005", `${what} has no ${child.name}`, `add .${child.name}(…)`, at));
    }
    // a state's namespaces, and a stateless construct's names, exist only when lowered
    const stateNames = Object.keys(c.def.state?.names ?? c.def.names ?? {});
    for (const call of [/** @type {Call} */ (/** @type {any} */ (inst).openCall), ...inst.calls]) {
      for (const r of call.found.refs) {
        if (stateNames.includes(r.ns)) continue; // checked against the state when lowered
        if (r.ns === INPUTS_NS) { this.checkInput(r, what, call); continue; }
        const { set, owner } = this.namespace(r.ns, inst);
        const known = [...set];
        const within = owner ? ` in ${owner.construct.name} '${instanceName(owner)}'` : "";
        if (!known.includes(r.value)) this.diagnostics.push(diag("B003", `${what}${call.slot === "(opens)" ? "" : `, .${call.slot}`}: ${where(r.path)}: there is no ${r.ns} '${r.value}'${within}.${didYouMean(r.value, known)}`, known.length ? `name one of: ${known.join(", ")}` : `declare ${an(r.ns)} first${within}`, { file: call.file, loc: call.loc }));
      }
    }
    if (typeof c.def.check === "function") c.def.check(inst === this.root ? seen : recordOf(inst), this.context(at, [], seen));
  }

  /**
   * A ref("in"): one of the Dialect's inputs, of the kind it asks for (B003, naming the kind and the inputs that fit).
   * @param {{ value: string, path: Array<string | number>, kind?: string }} r @param {string} what @param {Call} call
   */
  checkInput(r, what, call) {
    const inputs = this.g.dialect.seams?.in ?? {};
    const isEvent = (/** @type {string} */ n) => inputs[n].seam.kind === "event";
    const kindOf = (/** @type {string} */ n) => (isEvent(n) ? "an Event input" : "a value input");
    const fit = Object.keys(inputs).filter((n) => r.kind === undefined || (r.kind === "event") === isEvent(n));
    if (fit.includes(r.value)) return;
    const wanted = r.kind === "event" ? "an Event input" : r.kind === "value" ? "a value input" : "an input";
    const head = `${what}${call.slot === "(opens)" ? "" : `, .${call.slot}`}: ${where(r.path)}: `;
    // a name of the other kind is rarely spelled like the one meant, so its message lists every input that fits
    const message = Object.hasOwn(inputs, r.value) ? `'${r.value}' is ${kindOf(r.value)}; this takes ${wanted}${fit.length ? `: ${fit.map((n) => `'${n}'`).join(", ")}` : `, and the ${this.g.dialect.name} Dialect declares none`}.` : `there is no ${wanted.replace(/^an? /, "")} '${r.value}'.${didYouMean(r.value, fit)}`;
    this.diagnostics.push(diag("B003", `${head}${message}`, fit.length ? `name one of the ${this.g.dialect.name} Dialect's inputs: ${fit.join(", ")}` : `the ${this.g.dialect.name} Dialect declares no ${wanted.replace(/^an? /, "")}s in ports.in`, { file: call.file, loc: call.loc }));
  }

  /**
   * B008: each lambda's free names against the free-name rule; a name the scope holds resolves to a unit (its own
   * free names in turn), a name the host lists as build-time only is B013, and a top-level binding named like a
   * Dialect, Library or Program name is B002. Returns the resolved units.
   * @param {Record<string, unknown>} record @param {T.BuildOptions} options
   */
  checkFreeNames(record, options) {
    const d = this.g.dialect.def;
    /** @type {Set<string>} */
    const allowed = new Set([...this.names.get(UNITS) ?? []]);
    try {
      for (const n of Object.keys(this.g.dialect.environment(record).globals)) allowed.add(n);
    } catch { /* a hook that cannot run on a refused record adds nothing */ }
    const scope = options.scope;
    const buildTime = new Set(options.buildTime ?? []);
    const bindings = new Set(options.buildTimeBindings ?? []);
    // With the file's text, the scan leaves out the lambdas this Program was handed: their names are their own text's.
    const shadowed = new Set([...(options.shadowed ?? []), ...(options.file === undefined ? [] : buildTimeShadows(options.file, this.handed))]);
    const root = /** @type {Instance} */ (this.root);
    const own = this.ownNames();
    if (scope) for (const n of Object.keys(scope)) {
      if (!allowed.has(n) && !own.has(n)) continue;
      const whose = this.g.dialect.library.some((u) => u.name === n) ? "the Library's" : this.declaredUnit(n) ? "the Program's helper or constant" : `the ${d.name} Dialect's`;
      this.diagnostics.push(diag("B002", `the top-level '${n}' has the name of ${whose} '${n}': a lambda's '${n}' could mean either`, `rename the top-level '${n}'`, { file: root.file, loc: root.loc }));
    }
    const constSlot = Object.values(this.g.constructs).flatMap((c) => Object.entries(/** @type {Record<string, any>} */ (c.def.slots ?? {}))).find(([, s]) => s.kind === "unit" && s.unit === "const")?.[0];
    /** Each name looked up in the scope: its unit, or null when it was refused. @type {Map<string, { name: string, kind: "fn" | "const", src: string } | null>} */
    const resolved = new Map();
    // Resolved helpers join the list as it is walked, so their own free names resolve too.
    const sources = [...this.sources];
    // helpers: { check: "all" } lowers every top-level function, reached or not.
    if (scope && d.helpers?.check === "all") {
      for (const [name, v] of Object.entries(scope)) {
        if (typeof v !== "function" || allowed.has(name) || own.has(name)) continue;
        const r = unitOf(name, v, options.sources && Object.hasOwn(options.sources, name) ? options.sources[name] : undefined);
        if ("code" in r) {
          resolved.set(name, null);
          this.diagnostics.push(diag(r.code, `the top-level helper '${name}' is not a Runtime Lambda: ${r.reason}.`, r.tip, { file: root.file, loc: root.loc }));
          continue;
        }
        resolved.set(name, keyed(r.unit, options.keywords));
        if (r.ast) sources.push({ ast: r.ast, src: r.unit.src, what: `the top-level helper '${name}'`, at: { file: root.file, loc: root.loc } });
      }
    }
    for (const src of sources) {
      for (const { name, member, loc } of freeNames(src.ast)) {
        if (allowed.has(name) || resolved.has(name)) continue;
        const lambdaAt = { lambda: { src: src.src, loc } };
        const inScope = scope !== undefined && Object.hasOwn(scope, name);
        if (member !== undefined && JS_GLOBALS.has(name) && !inScope) {
          const bare = allowed.has(member) ? `use ${member}` : `${name} is not in the language`;
          this.diagnostics.push(diag("B008", `${src.what} reads "${name}", which it cannot see: only its text is compiled.`, `${bare}${bare === `use ${member}` ? `, not ${name}.${member}` : ""}`, src.at, lambdaAt));
          continue;
        }
        if (inScope) {
          const r = unitOf(name, /** @type {Record<string, unknown>} */ (scope)[name], options.sources && Object.hasOwn(options.sources, name) ? options.sources[name] : undefined);
          if ("code" in r) {
            resolved.set(name, null);
            this.diagnostics.push(diag(r.code, `${src.what} reads the top-level '${name}', which a lambda cannot use: ${r.reason}. A lambda can read ${PLAIN}.`, r.tip, src.at, lambdaAt));
            continue;
          }
          // Refused only once the binding itself is usable, so a mistake the binding has gets its own code alone.
          if (shadowed.has(name)) {
            resolved.set(name, null);
            this.diagnostics.push(diag("B013", `${src.what} reads "${name}", but the file declares "${name}" at its top level and again below it, in build-time code or a helper: a lambda's text cannot say which one it means, and the kit would read the top-level one.`, `rename one of the two "${name}"s`, src.at, lambdaAt));
            continue;
          }
          resolved.set(name, keyed(r.unit, options.keywords));
          if (r.ast) sources.push({ ast: r.ast, src: r.unit.src, what: `the top-level helper '${name}'`, at: src.at });
          continue;
        }
        if (buildTime.has(name) && !bindings.has(name) && sources.some((o) => o.ast !== src.ast && paramNames(o.ast).includes(name))) {
          this.diagnostics.push(diag("B013", `${src.what} reads "${name}": "${name}" is a parameter of another lambda, not a name this lambda can see.`, `pass it in as an argument (or a parameter of this lambda), or move this use into the lambda whose parameter it is`, src.at, lambdaAt));
          continue;
        }
        if (buildTime.has(name)) {
          this.diagnostics.push(diag("B013", `${src.what} reads "${name}", which this file declares only inside build-time code, not at its top level: a lambda sees only its own names, the ${d.name} Dialect's, the Program's and the file's top-level bindings.`, `move it to the top level (const ${name} = …), or write its value into the lambda's text: \`(…) => … \${${name}} …\``, src.at, lambdaAt));
          continue;
        }
        // A JavaScript value global is no name to declare: a param is finite, and a top-level one would shadow it.
        if (Object.hasOwn(VALUE_GLOBALS, name)) {
          this.diagnostics.push(diag("B008", `${src.what} reads "${name}", which it cannot see: only its text is compiled.`, `${name} is not in the ${d.name} language: use ${VALUE_GLOBALS[name]} instead`, src.at, lambdaAt));
          continue;
        }
        const ways = [scope ? "define it at the top level of the file" : null, constSlot ? `declare it on the Program, .${constSlot}("${name}", "…")` : null, d.globals && "$" in d.globals ? `make it a parameter and read $.${name}` : null].filter(Boolean);
        this.diagnostics.push(diag("B008", `${src.what} reads "${name}", which it cannot see: only its text is compiled.`, ways.length ? ways.join(", or ") : `use only its parameters, the ${d.name} Dialect's names and the Program's helpers`, src.at, lambdaAt));
      }
    }
    return /** @type {Array<{ name: string, kind: "fn" | "const", src: string }>} */ ([...resolved.values()].filter(Boolean));
  }

  /** Whether the Program declares a unit of this name (with .fn / .const). @param {string} n */
  declaredUnit(n) {
    return this.instances().some((i) => i.calls.some((c) => i.construct.def.slots?.[c.slot]?.kind === "unit" && c.args[0] === n));
  }

  /**
   * The builder of one instance: its slots, its children, its ancestors' methods, check and build.
   * @param {Instance} inst
   */
  builder(inst) {
    const program = this;
    /** @type {any} */
    const proxy = new Proxy({}, {
      // a builder is a chain of calls, not a record: nothing is set on it (its handles are read-only)
      set() { return false; },
      get(_, prop) {
        if (prop === PROGRAM) return program;
        if (prop === "out" || prop === "in" || prop === "frame") return sideOf(program, prop, program.g.dialect.seams, instanceName(/** @type {Instance} */ (program.root)), program.g.dialect.name);
        if (prop === Symbol.toPrimitive) return () => `[${inst.construct.name} builder '${instanceName(inst)}']`;
        if (typeof prop === "symbol" || PROBES.has(prop)) return undefined;
        if (prop === "check") return (/** @type {T.BuildOptions | undefined} */ o) => program.analyze(o).diagnostics;
        if (prop === "build") return (/** @type {T.BuildOptions | undefined} */ o) => program.build(o);
        const method = member(prop);
        // `.param.<name>` names a declared param for a param wire; where the param slot is itself `param`, its method answers them too
        if (prop === "param") {
          const part = instanceName(/** @type {Instance} */ (program.root));
          if (!method) return paramSideOf(program, part, program.g.dialect.name);
          if (program.paramSlot() === "param") return paramSideOf(program, part, program.g.dialect.name, method);
        }
        if (method) return method;
        const rejected = Object.hasOwn(inst.construct.rejected, prop) ? inst.construct.rejected[prop] : undefined;
        if (rejected) return () => { program.diagnostics.push(diag("B009", `${inst.construct.name} does not offer .${prop}(): ${rejected.message}`, rejected.tip ?? (rejected.fix ? `write ${rejected.fix}` : ""), callSite(), rejected.fix ? { fix: rejected.fix } : {})); return proxy; };
        const methods = [...KIT_METHODS];
        for (let i = /** @type {Instance | null} */ (inst); i; i = i.parent) methods.push(...Object.keys(i.construct.def.slots ?? {}), ...i.construct.children.map((x) => x.name));
        throw new BuildError([diag("B001", `${inst.construct.name} has no method "${prop}".${didYouMean(prop, methods)}`, `its methods are ${methods.join(", ")}`, callSite())]);
      },
    });
    /** A slot's or a child construct's method on this builder or an ancestor's, or undefined. @param {string} prop @returns {Function | undefined} */
    function member(prop) {
      for (let i = /** @type {Instance | null} */ (inst); i; i = i.parent) {
        const c = i.construct;
        const owner = i;
        if (c.def.slots && Object.hasOwn(c.def.slots, prop)) return (/** @type {unknown[]} */ ...args) => { program.call(owner, prop, args); return owner === inst ? proxy : program.builder(owner); };
        const child = c.children.find((x) => x.name === prop);
        if (child) return (/** @type {unknown[]} */ ...args) => program.open(child, owner, args, callSite());
      }
      return undefined;
    }
    return proxy;
  }
}

