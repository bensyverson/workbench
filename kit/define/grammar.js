// defineGrammar: a Grammar definition, checked, to the generated root builder. Each construct instance's
// builder has its slots, its child constructs and (forwarded) its ancestors' methods; an unknown method
// throws B001 at once, everything else is collected with the call site and thrown by `.build()`.

import { validateGrammar, KIT_METHODS, PROBES as PROBE_LIST } from "./validate-grammar.js";
import { refuse, isDialect } from "./dialect.js";
import { didYouMean, dialectError } from "./codes.js";
import { TAG, kindOf } from "./tags.js";
import { callSite } from "./site.js";
import { lambdaSource, constSource, found, where } from "./shapes.js";
import { recordOf, matchArgs, openKey, instanceName } from "./record.js";
import { freeNames } from "./free.js";
import { lowerRecord } from "./lower.js";
import { unitOf, PLAIN } from "./scope.js";
import { noteRoot, noteCall } from "./params.js";

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

/**
 * @param {string} code @param {string} message @param {string} tip @param {{ file: string, loc: Loc }} at @param {Partial<T.BuildDiagnostic>} [extra]
 * @returns {T.BuildDiagnostic}
 */
const diag = (code, message, tip, at, extra = {}) => ({ code, severity: "error", message, tip, loc: at.loc, range: [0, 0], file: at.file, ...extra });

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
  const g = { dialect, def: /** @type {Record<string, any>} */ (def), constructs: cs, root: cs[def.root] };
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
  if (x === null || typeof x !== "object" || Array.isArray(x)) throw new TypeError("build(options) and check(options) take { scope?, sources?, buildTime? }");
  for (const k of Object.keys(x)) if (k !== "scope" && k !== "sources" && k !== "buildTime") throw new TypeError(`build(options): unknown key '${k}'; it takes { scope?, sources?, buildTime? }`);
  if (x.scope !== undefined && (x.scope === null || typeof x.scope !== "object" || Array.isArray(x.scope))) throw new TypeError("build({ scope }): scope is an object of the file's top-level bindings, by name");
  if (x.sources !== undefined && (x.sources === null || typeof x.sources !== "object" || Array.isArray(x.sources) || !Object.values(x.sources).every((s) => typeof s === "string"))) throw new TypeError("build({ sources }): sources is an object of each top-level declaration's initializer text, by name");
  if (x.buildTime !== undefined && !(Array.isArray(x.buildTime) && x.buildTime.every((n) => typeof n === "string"))) throw new TypeError("build({ buildTime }): buildTime is a list of names");
}

/** @typedef {{ dialect: T.Dialect, def: Record<string, any>, constructs: Record<string, Construct>, root: Construct }} Compiled */

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
    this.names = new Map([[UNITS, new Set([...Object.keys(g.dialect.def.intrinsics ?? {}), ...g.dialect.library.map((u) => u.name), ...Object.keys(g.dialect.def.globals ?? {}), ...callableTypes(g.dialect.def.types), ...Object.keys(g.dialect.def.conversions ?? {})])]]);
    /** @type {Instance | null} */
    this.root = null;
    /** @type {Array<{ ast: ArrowFunctionExpression, src: string, what: string, at: { file: string, loc: Loc } }>} */
    this.sources = [];
  }

  /**
   * Opens a construct instance under `parent` and returns its builder.
   * @param {Construct} c @param {Instance | null} parent @param {unknown[]} args @param {{ file: string, loc: Loc }} at
   */
  open(c, parent, args, at) {
    if (parent) noteCall(this, `${c.name} ${JSON.stringify(typeof args[0] === "string" ? args[0] : c.name)}`);
    else noteRoot(this);
    const specs = /** @type {T.Tagged[]} */ (c.def.opens ?? []);
    const { args: made, found: f } = matchArgs(specs, args);
    /** @type {Record<string, unknown>} */
    const opened = {};
    specs.forEach((s, i) => { if (i < made.length) opened[openKey(s, i)] = made[i]; });
    /** @type {Instance} */
    const inst = { construct: c, opened, parent, children: [], calls: [], loc: at.loc, file: at.file };
    this.report(f.errors, c.name, at);
    specs.forEach((s, i) => { if (s[TAG] === "name" && typeof made[i] === "string") this.declare(/** @type {T.NameTag} */ (s), c.name, made[i], at, true); });
    if (c.def.state) this.declareState(c, instanceName(inst), at);
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
   * Declares a name; B002 when its namespace has it.
   * @param {T.NameTag | null} spec  null for a unit
   * @param {string} construct @param {string} value @param {{ file: string, loc: Loc }} at
   * @param {boolean} [label]  an opening name, which lambdas never read, so any non-empty string (`domain-warp`)
   */
  declare(spec, construct, value, at, label = false) {
    const ns = spec === null ? UNITS : typeof spec.ns === "string" ? spec.ns : construct;
    if (label ? value.trim() === "" : !IDENT.test(value)) { this.diagnostics.push(diag("B004", `${label ? "an empty name" : `'${value}' is not a name: a name is an identifier`}`, "use letters, digits, _ and $, not starting with a digit", at)); return; }
    const set = this.names.get(ns) ?? new Set();
    this.names.set(ns, set);
    if (set.has(value)) {
      const dialect = spec === null && this.g.dialect.library.some((u) => u.name === value) ? "the Library" : spec === null && this.ownNames().has(value) ? `the ${this.g.dialect.name} Dialect` : null;
      this.diagnostics.push(diag("B002", dialect ? `'${value}' is already defined by ${dialect}; a second one would replace it${dialect === "the Library" ? " inside the Library too" : ""}` : `'${value}' is already declared${ns === UNITS ? " as a helper or constant" : ` as a ${ns}`}`, `rename it`, at));
    } else set.add(value);
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

  /** The params declared so far, by name: each declaration, its `value` the default (for run). */
  declared() {
    const slot = this.paramSlot();
    /** @type {Map<string, Record<string, unknown>>} */
    const out = new Map();
    for (const c of this.root?.calls ?? []) if (slot !== undefined && c.slot === slot && typeof c.args[0] === "string") out.set(c.args[0], /** @type {Record<string, unknown>} */ (c.args[1]));
    return out;
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
      this.diagnostics.push(diag("B006", `${what} already has a ${slot}: .${slot}(…) may be called once`, `remove the second .${slot}(…)`, at));
      return;
    }
    const before = this.diagnostics.length;
    /** @type {Call} */
    let call;
    if (s.kind === "unit") {
      const [n, src] = args;
      if (typeof n !== "string") { this.diagnostics.push(diag("B004", `${what}: .${slot}(name, source) takes the name as a string, not ${typeof n}`, `.${slot}("name", …)`, at)); return; }
      this.declare(null, c.name, n, at);
      const r = s.unit === "fn" ? lambdaSource(src) : constSource(src);
      if ("error" in r) { this.diagnostics.push(diag("B007", `${what}: .${slot}('${n}'): ${r.error}`, s.unit === "fn" ? `.${slot}("${n}", (x) => …)` : `.${slot}("${n}", "0.5")`, at, /** @type {{ src?: string, loc?: Loc }} */ (r).src !== undefined ? { lambda: { src: /** @type {string} */ (/** @type {any} */ (r).src), ...(/** @type {any} */ (r).loc ? { loc: /** @type {any} */ (r).loc } : {}) } } : {})); return; }
      call = { slot, args: [n, r.src], loc: at.loc, file: at.file, found: found() };
      this.sources.push({ ast: r.ast, src: r.src, what: `the ${s.unit === "fn" ? "helper" : "constant"} '${n}'`, at });
    } else {
      const specs = /** @type {T.Tagged[]} */ (s.args);
      const m = matchArgs(specs, args);
      for (const e of m.found.errors) Object.assign(e, valueNotLambda(e, args, slot));
      this.report(m.found.errors, `${what}, .${slot}`, at);
      specs.forEach((sp, i) => { if (sp[TAG] === "name" && typeof m.args[i] === "string") this.declare(/** @type {T.NameTag} */ (sp), c.name, /** @type {string} */ (m.args[i]), at); else if (sp[TAG] === "name" && i < args.length) this.diagnostics.push(diag("B004", `${what}, .${slot}: argument ${i + 1} must be a name (a string), not ${typeof args[i]}`, `.${slot}("name", …)`, at)); });
      call = { slot, args: m.args, loc: at.loc, file: at.file, found: m.found };
      this.track(call, at);
    }
    inst.calls.push(call);
    if (!this.diagnostics.slice(before).some((d) => d.severity === "error") && typeof s.check === "function") {
      s.check({ slot, args: call.args }, this.context(at, call.args, this.record()));
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
  record() { return recordOf(/** @type {Instance} */ (this.root)); }

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
      for (const inst of this.instances()) this.checkInstance(inst, record);
      const units = this.checkFreeNames(record, options);
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

  /** @param {Instance} inst @param {Record<string, unknown>} record */
  checkInstance(inst, record) {
    const c = inst.construct;
    const what = `${c.name} '${instanceName(inst)}'`;
    const at = { file: inst.file, loc: inst.loc };
    for (const [sn, s] of Object.entries(/** @type {Record<string, any>} */ (c.def.slots ?? {}))) {
      if (s.required && !inst.calls.some((x) => x.slot === sn)) this.diagnostics.push(diag("B005", `${what} has no ${sn}`, `add .${sn}(…)`, at));
    }
    // a state's namespaces, and a stateless construct's names, exist only when lowered
    const stateNames = Object.keys(c.def.state?.names ?? c.def.names ?? {});
    for (const call of [/** @type {Call} */ (/** @type {any} */ (inst).openCall), ...inst.calls]) {
      for (const r of call.found.refs) {
        if (stateNames.includes(r.ns)) continue; // checked against the state when lowered
        const known = [...(this.names.get(r.ns) ?? [])];
        if (!known.includes(r.value)) this.diagnostics.push(diag("B003", `${what}${call.slot === "(opens)" ? "" : `, .${call.slot}`}: ${where(r.path)}: there is no ${r.ns} '${r.value}'.${didYouMean(r.value, known)}`, known.length ? `name one of: ${known.join(", ")}` : `declare a ${r.ns} first`, { file: call.file, loc: call.loc }));
      }
    }
    if (typeof c.def.check === "function") c.def.check(recordOf(inst), this.context(at, [], record));
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
          resolved.set(name, r.unit);
          if (r.ast) sources.push({ ast: r.ast, src: r.unit.src, what: `the top-level helper '${name}'`, at: src.at });
          continue;
        }
        if (buildTime.has(name)) {
          this.diagnostics.push(diag("B013", `${src.what} reads "${name}", which this file declares only inside build-time code, not at its top level: a lambda sees only its own names, the ${d.name} Dialect's, the Program's and the file's top-level bindings.`, `move it to the top level (const ${name} = …), or write its value into the lambda's text: \`(…) => … \${${name}} …\``, src.at, lambdaAt));
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
      get(_, prop) {
        if (prop === PROGRAM) return program;
        if (prop === Symbol.toPrimitive) return () => `[${inst.construct.name} builder '${instanceName(inst)}']`;
        if (typeof prop === "symbol" || PROBES.has(prop)) return undefined;
        if (prop === "check") return (/** @type {T.BuildOptions | undefined} */ o) => program.analyze(o).diagnostics;
        if (prop === "build") return (/** @type {T.BuildOptions | undefined} */ o) => program.build(o);
        for (let i = /** @type {Instance | null} */ (inst); i; i = i.parent) {
          const c = i.construct;
          const owner = i;
          if (c.def.slots && Object.hasOwn(c.def.slots, prop)) return (/** @type {unknown[]} */ ...args) => { program.call(owner, prop, args); return owner === inst ? proxy : program.builder(owner); };
          const child = c.children.find((x) => x.name === prop);
          if (child) return (/** @type {unknown[]} */ ...args) => program.open(child, owner, args, callSite());
        }
        const rejected = inst.construct.rejected[prop];
        if (rejected) return () => { program.diagnostics.push(diag("B009", `${inst.construct.name} does not offer .${prop}(): ${rejected.message}`, rejected.tip ?? (rejected.fix ? `write ${rejected.fix}` : ""), callSite(), rejected.fix ? { fix: rejected.fix } : {})); return proxy; };
        const methods = [...KIT_METHODS];
        for (let i = /** @type {Instance | null} */ (inst); i; i = i.parent) methods.push(...Object.keys(i.construct.def.slots ?? {}), ...i.construct.children.map((x) => x.name));
        throw new BuildError([diag("B001", `${inst.construct.name} has no method "${prop}".${didYouMean(prop, methods)}`, `its methods are ${methods.join(", ")}`, callSite())]);
      },
    });
    return proxy;
  }
}

