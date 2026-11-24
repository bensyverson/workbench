// defineGrammar: a Grammar definition, checked, to the generated root builder. Each construct instance's
// builder has its slots, its child constructs and (forwarded) its ancestors' methods; an unknown method
// throws B001 at once, everything else is collected with the call site and thrown by `.build()`.

import { validateGrammar, KIT_METHODS, PROBES as PROBE_LIST } from "./validate-grammar.js";
import { refuse, isDialect } from "./dialect.js";
import { didYouMean, RESERVED_LETTERS } from "./codes.js";
import { TAG, kindOf } from "./tags.js";
import { callSite } from "./site.js";
import { lambdaSource, constSource, found, where } from "./shapes.js";
import { recordOf, matchArgs, openKey, instanceName } from "./record.js";
import { freeNames } from "./free.js";
import { lowerRecord } from "./lower.js";

/** @import * as T from "./define.js" */
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

/** Properties a runtime or test library probes on any object; they are not method calls. */
const PROBES = new Set(PROBE_LIST);
/** The namespace unit names (.fn, .const) declare into, beside the Dialect's own names. */
const UNITS = "\0unit";
/** The namespace every stateful construct instance's name is in, whatever its construct. */
const STATES = "\0state";
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

/** @typedef {{ dialect: T.Dialect, def: Record<string, any>, constructs: Record<string, Construct>, root: Construct }} Compiled */

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
    /** @type {Array<{ ast: ArrowFunctionExpression, what: string, at: { file: string, loc: Loc } }>} */
    this.sources = [];
  }

  /**
   * Opens a construct instance under `parent` and returns its builder.
   * @param {Construct} c @param {Instance | null} parent @param {unknown[]} args @param {{ file: string, loc: Loc }} at
   */
  open(c, parent, args, at) {
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

  /** @param {Array<{ code: string, path: Array<string | number>, message: string }>} errors @param {string} what @param {{ file: string, loc: Loc }} at */
  report(errors, what, at) {
    for (const e of errors) this.diagnostics.push(diag(e.code, `${what}: ${e.message}`, e.code === "B007" ? "pass an arrow function, (x) => …, or its source text" : "pass a value of the shape the slot declares", at, { arg: e.path.length === 1 ? /** @type {number} */ (e.path[0]) : e.path }));
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

  /** The Dialect's own names, which units may not take. */
  ownNames() {
    const d = this.g.dialect.def;
    return new Set([...Object.keys(d.intrinsics ?? {}), ...Object.keys(d.globals ?? {}), ...Object.keys(d.types ?? {}), ...Object.keys(d.conversions ?? {})]);
  }

  /** Remembers a call's lambdas for the free-name rule. @param {Call} call @param {{ file: string, loc: Loc }} at */
  track(call, at) {
    for (const l of call.found.lambdas) this.sources.push({ ast: l.ast, what: `the ${l.convention} lambda${l.key ? ` '${l.key}'` : ""}`, at });
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
      if ("error" in r) { this.diagnostics.push(diag("B007", `${what}: .${slot}('${n}'): ${r.error}`, s.unit === "fn" ? `.${slot}("${n}", (x) => …)` : `.${slot}("${n}", "0.5")`, at)); return; }
      call = { slot, args: [n, r.src], loc: at.loc, file: at.file, found: found() };
      this.sources.push({ ast: r.ast, what: `the ${s.unit === "fn" ? "helper" : "constant"} '${n}'`, at });
    } else {
      const specs = /** @type {T.Tagged[]} */ (s.args);
      const m = matchArgs(specs, args);
      this.report(m.found.errors, `${what}, .${slot}`, at);
      specs.forEach((sp, i) => { if (sp[TAG] === "name" && typeof m.args[i] === "string") this.declare(/** @type {T.NameTag} */ (sp), c.name, /** @type {string} */ (m.args[i]), at); else if (sp[TAG] === "name" && i < args.length) this.diagnostics.push(diag("B004", `${what}, .${slot}: argument ${i + 1} must be a name (a string), not ${typeof args[i]}`, `.${slot}("name", …)`, at)); });
      call = { slot, args: m.args, loc: at.loc, file: at.file, found: m.found };
      this.track(call, at);
    }
    inst.calls.push(call);
    if (this.diagnostics.length === before && typeof s.check === "function") {
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
      /** @param {string} code @param {string} message @param {{ tip?: string, arg?: number | Array<string | number>, suggest?: string[], fix?: string }} [o] */
      error: (code, message, o = {}) => {
        if (!/^[A-Z]\d{3}$/.test(code) || RESERVED_LETTERS.includes(code[0])) throw new Error(`a check's code '${code}' must be the Dialect's own letter and three digits, not one of ${RESERVED_LETTERS.join(", ")}`);
        const path = o.arg === undefined ? [] : Array.isArray(o.arg) ? o.arg : [o.arg];
        /** @type {any} */
        let v = args;
        for (const p of path) v = v?.[p];
        const mean = o.suggest && typeof v === "string" ? didYouMean(v, o.suggest) : "";
        this.diagnostics.push(diag(code, `${message}${mean}`, o.tip ?? (o.fix ? `write ${o.fix}` : ""), at, { ...(o.arg !== undefined ? { arg: o.arg } : {}), ...(o.fix ? { fix: o.fix } : {}) }));
      },
    };
  }

  /** The record so far. */
  record() { return recordOf(/** @type {Instance} */ (this.root)); }

  /**
   * Every diagnostic: those collected at the calls, then the Program-wide ones (B003, B005, B008, construct checks).
   * @returns {T.BuildDiagnostic[]}
   */
  check() {
    const saved = this.diagnostics;
    this.diagnostics = [...saved];
    try {
      const record = this.record();
      for (const inst of this.instances()) this.checkInstance(inst, record);
      this.checkFreeNames(record);
      return this.diagnostics;
    } finally { this.diagnostics = saved; }
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
    const stateNames = Object.keys(c.def.state?.names ?? {});
    for (const call of [/** @type {Call} */ (/** @type {any} */ (inst).openCall), ...inst.calls]) {
      for (const r of call.found.refs) {
        if (stateNames.includes(r.ns)) continue; // checked against the state when lowered
        const known = [...(this.names.get(r.ns) ?? [])];
        if (!known.includes(r.value)) this.diagnostics.push(diag("B003", `${what}${call.slot === "(opens)" ? "" : `, .${call.slot}`}: ${where(r.path)}: there is no ${r.ns} '${r.value}'.${didYouMean(r.value, known)}`, known.length ? `name one of: ${known.join(", ")}` : `declare a ${r.ns} first`, { file: call.file, loc: call.loc }));
      }
    }
    if (typeof c.def.check === "function") c.def.check(recordOf(inst), this.context(at, [], record));
  }

  /** B008: each lambda's free names against the free-name rule. @param {Record<string, unknown>} record */
  checkFreeNames(record) {
    const d = this.g.dialect.def;
    /** @type {Set<string>} */
    const allowed = new Set([...this.names.get(UNITS) ?? []]);
    try {
      for (const n of Object.keys(this.g.dialect.environment(record).globals)) allowed.add(n);
    } catch { /* a hook that cannot run on a refused record adds nothing */ }
    const constSlot = Object.values(this.g.constructs).flatMap((c) => Object.entries(/** @type {Record<string, any>} */ (c.def.slots ?? {}))).find(([, s]) => s.kind === "unit" && s.unit === "const")?.[0];
    for (const src of this.sources) {
      for (const { name } of freeNames(src.ast)) {
        if (allowed.has(name)) continue;
        const ways = [constSlot ? `declare it on the Program, .${constSlot}("${name}", "…")` : null, d.globals && "$" in d.globals ? `make it a parameter and read $.${name}` : null].filter(Boolean);
        this.diagnostics.push(diag("B008", `${src.what} reads "${name}", which it cannot see: only its text is compiled.`, ways.length ? ways.join(", or ") : `use only its parameters, the ${d.name} Dialect's names and the Program's helpers`, src.at));
      }
    }
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
        if (prop === Symbol.toPrimitive) return () => `[${inst.construct.name} builder '${instanceName(inst)}']`;
        if (typeof prop === "symbol" || PROBES.has(prop)) return undefined;
        if (prop === "check") return () => program.check();
        if (prop === "build") return () => {
          const ds = program.check();
          if (ds.some((x) => x.severity === "error")) throw new BuildError(ds);
          return program.record();
        };
        for (let i = /** @type {Instance | null} */ (inst); i; i = i.parent) {
          const c = i.construct;
          const owner = i;
          if (c.def.slots && Object.hasOwn(c.def.slots, prop)) return (/** @type {unknown[]} */ ...args) => { program.call(owner, prop, args); return owner === inst ? proxy : program.builder(owner); };
          const child = c.children.find((x) => x.name === prop);
          if (child) return (/** @type {unknown[]} */ ...args) => program.open(child, owner, args, callSite());
        }
        const rejected = inst.construct.rejected[prop];
        if (rejected) return () => { program.diagnostics.push(diag("B009", `${inst.construct.name} does not offer .${prop}(): ${rejected.message}`, rejected.tip ?? "", callSite())); return proxy; };
        const methods = [...KIT_METHODS];
        for (let i = /** @type {Instance | null} */ (inst); i; i = i.parent) methods.push(...Object.keys(i.construct.def.slots ?? {}), ...i.construct.children.map((x) => x.name));
        throw new BuildError([diag("B001", `${inst.construct.name} has no method "${prop}".${didYouMean(prop, methods)}`, `its methods are ${methods.join(", ")}`, callSite())]);
      },
    });
    return proxy;
  }
}

