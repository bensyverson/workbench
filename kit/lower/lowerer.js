// The state of lowering one lambda: scopes and unique local names, the statement
// sink that expressions spill into, narrowing facts, effects, and diagnostics.

import { LineTable } from "../parse/lexer.js";

/** @import { Diagnostic, Node, ArrowFunctionExpression } from "../parse/ast.js" */
/** @import { Type, Expr, Stmt, Local, Effect, EffectVerb, Span } from "../ir/ir.js" */
/** @import { Dialect, SlotRef, SlotDecl, Signatures } from "./dialect.js" */
/** @import { LowerCode } from "./codes.js" */

/**
 * @typedef {object} Binding
 * @property {string} name   The unique IR name.
 * @property {Type} t
 * @property {Local["kind"]} kind
 * @property {{ code: LowerCode, message: string, tip: string }} [pending]  Reported at the first use: a type lowering could not infer.
 */

/** Effects a query callback may have: reads only. */
const PURE = new Set(["read", "input"]);

/** Expression kinds whose value cannot change between evaluation and use. */
const CONSTANT_KINDS = new Set(["num", "str", "bool", "null", "undef", "global"]);

/** Expression fields that hold child expressions. */
const CHILD_KEYS = ["args", "test", "then", "else", "recv", "of", "value", "init", "list"];

export class Lowerer {
  /**
   * @param {Dialect} dialect
   * @param {string} src
   * @param {SlotRef} slot
   * @param {SlotDecl} decl
   * @param {Signatures} sigs
   * @param {ArrowFunctionExpression} ast
   */
  constructor(dialect, src, slot, decl, sigs, ast) {
    this.dialect = dialect;
    this.src = src;
    this.slot = slot;
    this.decl = decl;
    this.sigs = sigs;
    this.lines = new LineTable(src);
    /** @type {Diagnostic[]} */
    this.diagnostics = [];
    /** @type {Local[]} */
    this.locals = [];
    /** @type {Map<string, Binding>[]} */
    this.scopes = [new Map()];
    /** Unique names of optional locals known to be present here. */
    this.narrowed = new Set();
    /** @type {Stmt[]} */
    this.out = [];
    /** Depth inside query callbacks, where only reads are allowed. */
    this.pure = 0;
    /** @type {Type[]} */
    this.returns = [];
    /** @type {Array<{ name: string, t: Type }>} */
    this.emits = [];
    /** @type {Array<{ key: string, args: Type[] }>} */
    this.calls = [];
    /** @type {WeakMap<object, Effect[]>} */
    this.fx = new WeakMap();
    this.temps = 0;
    /** Every identifier in the source, so generated names never collide. */
    this.taken = new Set();
    /** Names the lambda itself declares; a callback parameter with one of these is renamed. */
    this.reserved = new Set();
    scanNames(ast, this.taken, this.reserved, true);
  }

  /**
   * Records a diagnostic.
   * @param {LowerCode} code
   * @param {{ range: [number, number] } | Span} at
   * @param {string} message
   * @param {string} tip
   */
  error(code, at, message, tip) {
    const range = /** @type {[number, number]} */ (Array.isArray(at) ? at : at.range);
    if (this.diagnostics.some((d) => d.code === code && d.range[0] === range[0] && d.range[1] === range[1])) return;
    this.diagnostics.push({
      code, severity: "error", message, tip,
      loc: { start: this.lines.at(range[0]), end: this.lines.at(range[1]) },
      range: [range[0], range[1]],
    });
  }

  /** Whether lowering has reported an error. */
  get failed() { return this.diagnostics.some((d) => d.severity === "error"); }

  /**
   * Declares a local in the current scope and returns its unique name.
   * @param {string} source
   * @param {Type} t
   * @param {Local["kind"]} kind
   * @param {{ callback?: boolean, pending?: Binding["pending"] }} [opts]
   */
  declare(source, t, kind, opts = {}) {
    let name = source;
    const used = (/** @type {string} */ n) => this.locals.some((l) => l.name === n);
    if (used(name) || (opts.callback && this.reserved.has(name))) {
      let n = 1;
      while (used(`${source}_${n}`) || this.taken.has(`${source}_${n}`)) n++;
      name = `${source}_${n}`;
    }
    this.locals.push({ name, t, kind, ...(name !== source ? { source } : {}) });
    this.scopes[this.scopes.length - 1].set(source, { name, t, kind, ...(opts.pending ? { pending: opts.pending } : {}) });
    return name;
  }

  /**
   * A new temporary of type `t`.
   * @param {Type} t
   */
  temp(t) {
    let name;
    do name = `t${this.temps++}`; while (this.taken.has(name));
    this.locals.push({ name, t, kind: "temp" });
    return name;
  }

  /**
   * Binds `source` in the current scope to an existing local (a reduce accumulator).
   * @param {string} source
   * @param {Binding} b
   */
  alias(source, b) { this.scopes[this.scopes.length - 1].set(source, b); }

  /** @param {string} source */
  lookup(source) {
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      const b = this.scopes[i].get(source);
      if (b) return b;
    }
    return undefined;
  }

  /**
   * Runs `fn` in a new scope; narrowing facts learned inside do not leak out.
   * @template R
   * @param {() => R} fn
   * @param {Iterable<string>} [facts]  Names known present inside.
   * @returns {R}
   */
  scoped(fn, facts = []) {
    const saved = new Set(this.narrowed);
    for (const f of facts) this.narrowed.add(f);
    this.scopes.push(new Map());
    try { return fn(); } finally { this.scopes.pop(); this.narrowed = saved; }
  }

  /**
   * Runs `fn` with a fresh statement sink and returns what it emitted.
   * @template R
   * @param {() => R} fn
   * @param {Iterable<string>} [facts]
   * @returns {{ stmts: Stmt[], value: R }}
   */
  capture(fn, facts) {
    const saved = this.out;
    this.out = [];
    try {
      const value = this.scoped(fn, facts);
      return { stmts: this.out, value };
    } finally { this.out = saved; }
  }

  /**
   * Finishes an expression node: its effects are its children's, then `own`.
   * @template {Expr} E
   * @param {E} e
   * @param {Effect[]} [own]
   * @returns {E}
   */
  ex(e, own = []) {
    this.checkEffects(own, e.span);
    this.fx.set(e, dedupe([...childEffects(e, this.fx), ...own]));
    return e;
  }

  /**
   * Appends a statement, recording its effects: those of its own expressions, then `own`.
   * @param {Stmt extends infer S ? S extends Stmt ? Omit<S, "effects"> : never : never} s
   * @param {Effect[]} [own]
   */
  emit(s, own = []) {
    this.checkEffects(own, s.span);
    const stmt = /** @type {Stmt} */ ({ ...s, effects: dedupe([...childEffects(s, this.fx), ...own]) });
    this.out.push(stmt);
    return stmt;
  }

  /**
   * The effects of an expression already lowered.
   * @param {Expr} e
   */
  effectsOf(e) { return this.fx.get(e) ?? []; }

  /**
   * Whether `e` yields the same value however late it is read.
   * @param {Expr} e
   * @returns {boolean}
   */
  stable(e) {
    if (CONSTANT_KINDS.has(e.k)) return true;
    // A read-only field that records no read (a handle like w.rng, a baked constant) cannot change.
    if (e.k === "load") return !e.place.store && this.effectsOf(e).length === 0 && this.stable(e.place.recv);
    if (e.k !== "local") return false;
    const local = this.locals.find((l) => l.name === e.name);
    return !local || local.kind !== "let";
  }

  /**
   * Reports effects this position may not have: state changes inside a query callback, or verbs the slot forbids.
   * @param {Effect[]} effects
   * @param {Span} span
   */
  checkEffects(effects, span) {
    for (const effect of effects) {
      const verb = /** @type {EffectVerb} */ (effect.split(" ")[0]);
      if (this.pure > 0 && !PURE.has(verb)) {
        this.error("L006", span, `A query callback must be pure, but this has the effect '${effect}'.`, "Keep callbacks pure: compute the effect after the query, from its result.");
      }
      if (this.decl.forbid.includes(verb)) {
        this.error("L004", span, `A ${this.slot.kind} may not '${effect}'.`, `Move it to an onFrame or an event handler: ${this.decl.forbidWhy ?? `${this.slot.kind} does not allow ${verb}`}.`);
      }
    }
  }
}

/**
 * Child expressions' effects, in evaluation order.
 * @param {object} node
 * @param {WeakMap<object, Effect[]>} fx
 * @returns {Effect[]}
 */
function childEffects(node, fx) {
  /** @type {Effect[]} */
  const out = [];
  const o = /** @type {Record<string, unknown>} */ (node);
  if (o.k === "load" || o.k === "store") out.push(...(fx.get(/** @type {{ place: { recv: object } }} */ (o).place.recv) ?? []));
  if (o.k === "struct") for (const v of Object.values(/** @type {Record<string, object>} */ (o.fields))) out.push(...(fx.get(v) ?? []));
  for (const key of CHILD_KEYS) {
    const v = o[key];
    // Statements are never in `fx`, so an `if`'s branches add nothing here.
    if (Array.isArray(v)) { for (const x of v) if (x && typeof x === "object") out.push(...(fx.get(x) ?? [])); }
    else if (v && typeof v === "object") out.push(...(fx.get(v) ?? []));
  }
  return out;
}

/**
 * @param {Effect[]} effects
 * @returns {Effect[]}
 */
export function dedupe(effects) { return [...new Set(effects)]; }

/**
 * Collects every identifier name, and the names the lambda declares outside callbacks.
 * @param {unknown} node
 * @param {Set<string>} taken
 * @param {Set<string>} reserved
 * @param {boolean} top  True for the lambda itself, whose parameters are reserved.
 */
function scanNames(node, taken, reserved, top) {
  if (Array.isArray(node)) { for (const n of node) scanNames(n, taken, reserved, false); return; }
  if (!node || typeof node !== "object") return;
  const n = /** @type {Node & Record<string, unknown>} */ (node);
  if (n.type === "Identifier") taken.add(/** @type {string} */ (n.name));
  if (n.type === "VariableDeclarator" && n.id.type === "Identifier") reserved.add(n.id.name);
  if (top && n.type === "ArrowFunctionExpression") for (const p of n.params) if (p.type === "Identifier") reserved.add(p.name);
  for (const [k, v] of Object.entries(n)) if (k !== "loc" && k !== "range") scanNames(v, taken, reserved, false);
}
