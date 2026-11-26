// The IR verifier: checks a Kernel against the invariants the IR states (ir.d.ts,
// README.md), so a stage that produced it, or a pass that rewrote it, cannot hand a
// backend a Kernel that breaks them. Its diagnostics are kit bugs, not the author's.
// It reads the Kernel alone: no environment, no dialect. Rules are tables keyed by
// node kind (`EXPR`, `STMT`) and operator (`OPS`), so new kinds add entries.

import { assignable, join, sameType, strictJoin, itemAt, optional, showType } from "./types.js";
import { formatJSON, jsonDifference } from "./json.js";
import { shapeProblems } from "./verify-shape.js";
import { typeProblem, OPS, EFFECT_VERBS, ownerOf, storeFits, unbounded, isSampler } from "./verify-rules.js";

/** @import { Kernel, Expr, Stmt, Type, Span, Place, Local, Effect, EffectVerb, Op } from "./ir.js" */

/** Each code and the invariant it guards. Every one is a bug in the kit, never in the author's program. */
export const VERIFY_CODES = Object.freeze({
  V001: "A node of no known kind, or missing a field its kind has",
  V002: "A type that disagrees with the node's operands or its kind",
  V003: "A type no Kernel may hold: unknown, a type variable, an unbounded list",
  V004: "A name used where nothing binds it, or bound without being among the kernel's locals",
  V005: "A name bound twice",
  V006: "An assignment to a name or place that cannot change",
  V007: "A statement whose recorded effects miss what it does",
  V008: "Kernel effects that are not its statements' effects, deduplicated in first-seen order",
  V009: "A loop that is not bounded",
  V010: "A break or continue outside a loop",
  V011: "A node without a span inside the kernel's source",
  V012: "A kernel whose JSON form does not read back the same",
});

/** @typedef {keyof typeof VERIFY_CODES} VerifyCode */

/**
 * A broken invariant. `path` locates the node (`body[0].then[1].value`); `span` is its
 * span when it has a valid one.
 * @typedef {{ code: VerifyCode, message: string, path: string, span: Span | null }} VerifyDiagnostic
 */

/**
 * How to verify. `partial` is for a kernel lowered outside its program or before inference
 * settles (every kernel `lowerLambda` makes): there `unknown` may stand for a type not yet
 * inferred, such as a method's result with no signature. A finished program's kernels are
 * verified without it.
 * @typedef {{ partial?: boolean }} VerifyOptions
 */

/**
 * Checks `kernel` against the IR's invariants. Never throws: anything it cannot read is a V001.
 * @param {Kernel} kernel
 * @param {VerifyOptions} [options]
 * @returns {VerifyDiagnostic[]}
 */
export function verify(kernel, options = {}) {
  /** @type {VerifyDiagnostic[]} */
  const out = [];
  try {
    const shape = shapeProblems(kernel);
    if (shape.length) return shape.map((s) => ({ code: "V001", message: s.message, path: s.path, span: null }));
    new Checker(kernel, out, options.partial === true).run();
    roundTrip(kernel, out);
  } catch (e) {
    out.push({ code: "V001", message: `The verifier could not read this kernel: ${e instanceof Error ? e.message : String(e)}.`, path: "", span: null });
  }
  return out;
}

/**
 * V012: the JSON form, parsed, must equal the kernel, numbers compared with `Object.is`.
 * @param {Kernel} kernel
 * @param {VerifyDiagnostic[]} out
 */
function roundTrip(kernel, out) {
  let back;
  try { back = JSON.parse(formatJSON(kernel)); } catch (e) {
    out.push({ code: "V012", message: `The kernel has no JSON form: ${e instanceof Error ? e.message : String(e)}.`, path: "", span: null });
    return;
  }
  const diff = jsonDifference(kernel, back);
  if (diff !== null) out.push({ code: "V012", message: `The JSON form reads back differently at ${diff || "the root"}.`, path: diff, span: null });
}

/** Kinds of local that a `set` or `push` may change. */
const MUTABLE = new Set(["let", "temp"]);

class Checker {
  /**
   * @param {Kernel} kernel
   * @param {VerifyDiagnostic[]} out
   * @param {boolean} partial  Whether `unknown` may stand for a type not yet inferred.
   */
  constructor(kernel, out, partial) {
    this.k = kernel;
    this.out = out;
    this.partial = partial;
    /** Every local and parameter, by name. @type {Map<string, Local>} */
    this.declared = new Map();
    /** Names a binder has bound so far. @type {Set<string>} */
    this.bound = new Set();
    /** Names visible here, innermost last. @type {Set<string>[]} */
    this.scopes = [new Set()];
    this.loops = 0;
  }

  /**
   * @param {VerifyCode} code
   * @param {string} message
   * @param {string} path
   * @param {unknown} [span]
   */
  report(code, message, path, span) {
    this.out.push({ code, message, path, span: this.goodSpan(span) ? /** @type {Span} */ (span) : null });
  }

  /** @param {unknown} span */
  goodSpan(span) {
    return Array.isArray(span) && span.length === 2 && Number.isInteger(span[0]) && Number.isInteger(span[1]) && span[0] >= 0 && span[0] <= span[1] && span[1] <= this.k.src.length;
  }

  /**
   * V011 for a node's span.
   * @param {{ span?: unknown }} node
   * @param {string} path
   */
  span(node, path) {
    if (!this.goodSpan(node.span)) this.report("V011", `This node's span ${JSON.stringify(node.span) ?? "is missing"}${node.span === undefined ? "" : `, which is not [start, end] inside the ${this.k.src.length} characters of src`}.`, path);
  }

  /**
   * V003 for a type in a position.
   * @param {Type} t
   * @param {string} path
   * @param {unknown} span
   */
  type(t, path, span) {
    const p = typeProblem(t, this.partial);
    if (p) this.report("V003", `${showSafe(t)}: ${p}.`, path, span);
  }

  run() {
    const k = this.k;
    if (!this.goodSpan(k.span)) this.report("V011", `The kernel's span ${JSON.stringify(k.span)} is not [start, end] inside its src.`, "span");
    this.type(k.returns, "returns", null);
    if (isSampler(k.returns)) this.report("V002", "A kernel never returns a sampler: a sampler is only passed to a call.", "returns");
    k.locals.forEach((l, i) => { if (isSampler(l.t)) this.report("V002", `'${l.name}' is a ${l.kind} of type sampler: only a parameter holds a sampler.`, `locals[${i}]`); });
    [...k.params.map((l, i) => /** @type {const} */ ([l, `params[${i}]`])), ...k.locals.map((l, i) => /** @type {const} */ ([l, `locals[${i}]`]))].forEach(([l, path]) => {
      this.type(l.t, `${path}.t`, null);
      if (this.declared.has(l.name)) this.report("V005", `'${l.name}' is declared twice among the kernel's parameters and locals.`, path);
      else this.declared.set(l.name, l);
    });
    for (const p of k.params) { this.bound.add(p.name); this.scopes[0].add(p.name); }
    this.block(k.body, "body");
    this.kernelEffects();
  }

  kernelEffects() {
    /** @type {Effect[]} */
    const all = [];
    const walk = (/** @type {Stmt[]} */ stmts) => {
      for (const s of stmts) {
        all.push(...s.effects);
        if (s.k === "if") { walk(s.then); walk(s.else); }
        if (s.k === "for") { walk(s.update); walk(s.body); }
        if (s.k === "each") walk(s.body);
      }
    };
    walk(this.k.body);
    const sum = [...new Set(all)];
    if (JSON.stringify(sum) !== JSON.stringify(this.k.effects)) {
      this.report("V008", `The kernel records effects [${this.k.effects.join(", ")}], but its statements have [${sum.join(", ")}].`, "effects");
    }
  }

  /**
   * Checks statements in a new scope.
   * @param {Stmt[]} stmts
   * @param {string} path
   */
  block(stmts, path) {
    this.scopes.push(new Set());
    stmts.forEach((s, i) => this.stmt(s, `${path}[${i}]`));
    this.scopes.pop();
  }

  /** @param {string} name */
  visible(name) { return this.scopes.some((s) => s.has(name)); }

  /**
   * Binds `name` at a binder (let, for, each), from here to the end of the enclosing block.
   * @param {string} name
   * @param {Type} t
   * @param {string} path
   * @param {unknown} span
   * @param {Set<string>} [into]  The scope to bind in; the current block's by default.
   * @returns {Local | undefined}
   */
  bind(name, t, path, span, into = this.scopes[this.scopes.length - 1]) {
    const l = this.declared.get(name);
    if (!l) { this.report("V004", `'${name}' is bound here but is not among the kernel's locals.`, path, span); return undefined; }
    if (this.bound.has(name)) this.report("V005", `'${name}' is bound a second time.`, path, span);
    else if (!sameType(l.t, t)) this.report("V002", `'${name}' is bound as ${showSafe(t)} but declared ${showSafe(l.t)}.`, path, span);
    this.bound.add(name);
    into.add(name);
    return l;
  }

  /**
   * The local a statement changes, after V004 and V006.
   * @param {string} name
   * @param {string} path
   * @param {unknown} span
   * @returns {Local | undefined}
   */
  mutable(name, path, span) {
    const l = this.declared.get(name);
    if (!l || !this.visible(name)) { this.report("V004", `'${name}' is changed here, where nothing binds it.`, path, span); return undefined; }
    if (!MUTABLE.has(l.kind)) { this.report("V006", `'${name}' is a ${l.kind === "param" ? "parameter" : l.kind}, which cannot change.`, path, span); return undefined; }
    return l;
  }

  /**
   * @param {Stmt} s
   * @param {string} path
   */
  stmt(s, path) {
    this.span(s, path);
    for (const e of s.effects) this.effectName(e, `${path}.effects`, s.span);
    /** @type {Effect[]} */
    const does = [];
    const ex = (/** @type {Expr} */ e, /** @type {string} */ key) => { const fx = this.expr(e, `${path}.${key}`); does.push(...fx); return e; };
    const rule = STMT[s.k];
    rule({ c: this, s: /** @type {never} */ (s), path, ex, does });
    const missing = [...new Set(does)].filter((e) => !s.effects.includes(e));
    if (missing.length) this.report("V007", `This ${s.k} does [${missing.join(", ")}] but records only [${s.effects.join(", ")}].`, path, s.span);
  }

  /**
   * @param {string} e
   * @param {string} path
   * @param {unknown} span
   */
  effectName(e, path, span) {
    const [verb, ...rest] = e.split(" ");
    if (!EFFECT_VERBS.has(/** @type {EffectVerb} */ (verb)) || (rest.length > 0 && rest.join(" ") === "")) this.report("V007", `'${e}' is not an effect: it names no known verb.`, path, span);
  }

  /**
   * Checks an expression and returns what evaluating it does.
   * @param {Expr} e
   * @param {string} path
   * @param {boolean} [asArg]  Whether it stands as an argument of a call (`call`, `method`, `helper`): the one place a sampler may.
   * @returns {Effect[]}
   */
  expr(e, path, asArg = false) {
    this.span(e, path);
    this.type(e.t, `${path}.t`, e.span);
    /** @type {Effect[]} */
    const does = [];
    const sub = (/** @type {Expr} */ c, /** @type {string} */ key, /** @type {boolean} */ arg = false) => { does.push(...this.expr(c, `${path}.${key}`, arg)); return c; };
    const bad = (/** @type {string} */ message) => this.report("V002", message, path, e.span);
    if (isSampler(e.t)) {
      if (!asArg) bad("A sampler stands only as an argument of a call; it is not an operand, a condition's arm, a value to hold or return, or a receiver.");
      else if (e.k !== "load" && e.k !== "local") bad(`A sampler is a load of a uniform or a parameter, not a ${e.k}.`);
    }
    EXPR[e.k]({ c: this, e: /** @type {never} */ (e), sub, bad, does, path });
    return does;
  }

  /**
   * Checks a place: its receiver, its owner, its store rule. Returns its receiver's effects.
   * @param {Place} p
   * @param {string} path
   * @param {unknown} span
   * @returns {Effect[]}
   */
  place(p, path, span) {
    const does = this.expr(p.recv, `${path}.recv`);
    this.type(p.t, `${path}.t`, span);
    const owner = ownerOf(p.recv.t);
    if (owner !== p.owner) this.report("V002", `A field of ${showSafe(p.recv.t)} is owned by ${p.owner}.`, path, span);
    if (p.store && !storeFits(p.store, p.t)) this.report("V002", `${article(showSafe(p.t))} ${showSafe(p.t)} place is stored as ${p.store.type}.`, path, span);
    return does;
  }
}

/**
 * "An" before a name said with a vowel sound (an enum, an f32), else "A".
 * @param {string} name
 */
const article = (name) => (/^([aeiou]|f\d)/i.test(name) ? "An" : "A");

/**
 * `showType`, for a type that may be malformed.
 * @param {Type} t
 */
function showSafe(t) {
  try { return showType(t); } catch { return JSON.stringify(t); }
}

/**
 * @typedef {(e: Expr, key: string, asArg?: boolean) => Expr} Sub
 * @typedef {(message: string) => void} Bad
 */

/** Per expression kind: check its type against its operands, recursing through `sub`; add its own effects to `does`. */
const EXPR = /** @type {{ [K in Expr["k"]]: (x: { c: Checker, e: Extract<Expr, { k: K }>, sub: Sub, bad: Bad, does: Effect[], path: string }) => void }} */ ({
  num: ({ e, bad }) => {
    if (e.t !== "f32" && e.t !== "f64") { bad(`A number is f64 or f32, not ${showSafe(e.t)}.`); return; }
    if (!Number.isFinite(e.v)) bad(`A number is finite, not ${e.v}.`);
    else if (Object.is(e.v, -0)) bad("A number is never negative zero; write the negation of 0.");
    else if (e.t === "f32" && Math.fround(e.v) !== e.v) bad(`An f32 number holds a finite f32 value, not ${e.v}.`);
  },
  str: ({ e, bad }) => { if (!sameType(e.t, { enum: [e.v] })) bad(`A string literal is typed by its value, ${JSON.stringify(e.v)}, not ${showSafe(e.t)}.`); },
  bool: ({ e, bad }) => { if (e.t !== "bool") bad(`A boolean is bool, not ${showSafe(e.t)}.`); },
  null: ({ e, bad }) => { if (e.t !== "null") bad(`null is typed null, not ${showSafe(e.t)}.`); },
  undef: ({ e, bad }) => { if (!(typeof e.t === "object" && "opt" in e.t)) bad(`undefined is a possibly-empty value, not ${showSafe(e.t)}.`); },
  local: ({ c, e, bad, path }) => {
    const l = c.declared.get(e.name);
    if (!l || !c.visible(e.name)) { c.report("V004", `'${e.name}' is used here, where nothing binds it.`, path, e.span); return; }
    const narrowed = typeof l.t === "object" && "opt" in l.t && sameType(e.t, l.t.opt);
    if (!sameType(e.t, l.t) && !narrowed) bad(`'${e.name}' is ${showSafe(l.t)}, but this use is typed ${showSafe(e.t)}.`);
  },
  global: () => {},
  load: ({ c, e, bad, does, path }) => {
    does.push(...c.place(e.place, `${path}.place`, e.span));
    if (!sameType(e.t, e.place.t)) bad(`A load is typed as its place, ${showSafe(e.place.t)}, not ${showSafe(e.t)}.`);
    // A writable place is state, and reading state is a recorded effect.
    if (e.place.store || e.place.total) does.push(/** @type {Effect} */ (`read ${e.place.owner}.${e.place.name}`));
  },
  op: ({ e, sub, bad }) => {
    e.args.forEach((a, i) => sub(a, `args[${i}]`));
    const rule = OPS[/** @type {Op} */ (e.op)];
    if (!rule) { bad(`'${e.op}' is not an operator.`); return; }
    const problem = rule(e.args.map((a) => a.t), e.t);
    if (problem) bad(`${e.op}: ${problem}.`);
  },
  cond: ({ e, sub, bad }) => {
    sub(e.test, "test"); sub(e.then, "then"); sub(e.else, "else");
    if (!assignable(e.test.t, "bool")) bad(`A cond tests a bool, not ${showSafe(e.test.t)}.`);
    if (!sameType(e.t, join(e.then.t, e.else.t))) bad(`A cond is typed as the join of its arms, ${showSafe(join(e.then.t, e.else.t))}, not ${showSafe(e.t)}.`);
  },
  call: ({ c, e, sub, does, path }) => {
    if (e.recv) sub(e.recv, "recv");
    e.args.forEach((a, i) => sub(a, `args[${i}]`, true));
    for (const f of e.effects) c.effectName(f, `${path}.effects`, e.span);
    does.push(...e.effects);
  },
  method: ({ c, e, sub, bad, does, path }) => {
    sub(e.recv, "recv");
    e.args.forEach((a, i) => sub(a, `args[${i}]`, true));
    if (ownerOf(e.recv.t) !== e.owner) bad(`A method of ${e.owner} is called on ${showSafe(e.recv.t)}.`);
    for (const f of e.effects) c.effectName(f, `${path}.effects`, e.span);
    does.push(`call ${e.owner}.${e.name}`, ...e.effects);
  },
  helper: ({ c, e, sub, does, path }) => {
    e.args.forEach((a, i) => sub(a, `args[${i}]`, true));
    for (const f of e.effects) c.effectName(f, `${path}.effects`, e.span);
    does.push(`call ${e.name}`, ...e.effects);
  },
  struct: ({ e, sub, bad }) => {
    for (const [k, v] of Object.entries(e.fields)) sub(v, `fields.${k}`);
    if (!(typeof e.t === "object" && "struct" in e.t)) { bad(`A struct literal has a struct type, not ${showSafe(e.t)}.`); return; }
    const t = e.t;
    const optional_ = new Set(t.optional ?? []);
    for (const [k, v] of Object.entries(e.fields)) if (!(k in t.struct) || !assignable(v.t, t.struct[k])) bad(`Field '${k}' is ${showSafe(v.t)}, but the struct's type ${k in t.struct ? `has ${showSafe(t.struct[k])}` : "lacks it"}.`);
    for (const k of Object.keys(t.struct)) if (!(k in e.fields) && !optional_.has(k)) bad(`The struct's type has field '${k}', which the literal does not set.`);
  },
  field: ({ e, sub, bad }) => {
    sub(e.of, "of");
    const of = e.of.t;
    if (typeof of === "object" && "struct" in of) {
      if (!(e.name in of.struct)) { bad(`${showSafe(of)} has no field '${e.name}'.`); return; }
      const ft = of.struct[e.name];
      const want = (of.optional ?? []).includes(e.name) ? optional(ft) : ft;
      if (!sameType(e.t, want)) bad(`Field '${e.name}' is ${showSafe(want)}, not ${showSafe(e.t)}.`);
    } else if (typeof of === "object" && "list" in of) {
      if (e.name !== "length" || e.t !== "f64") bad(`A list's only field is length, an f64; not '${e.name}': ${showSafe(e.t)}.`);
    } else if (typeof of === "object" && "vec" in of) {
      const names = COMPONENTS.slice(0, of.vec);
      if (!names.includes(e.name)) bad(`A ${showSafe(of)} has components ${names.join(", ")}, not '${e.name}'.`);
      else if (e.t !== of.of) bad(`A component of ${showSafe(of)} is ${of.of}, not ${showSafe(e.t)}.`);
    } else bad(`A field is read from a struct, a list or a vector, not ${showSafe(of)}.`);
  },
  index: ({ e, sub, bad }) => {
    sub(e.of, "of"); sub(e.index, "index");
    const of = e.of.t;
    if (!(typeof of === "object" && "list" in of)) { bad(`Only a list is indexed, not ${showSafe(of)}.`); return; }
    if (!assignable(e.index.t, "f64")) bad(`A list index is f64, not ${showSafe(e.index.t)}.`);
    const want = itemAt(of, e.index.k === "num" ? e.index.v : null);
    if (!sameType(e.t, want)) bad(`This index is ${showSafe(want)}, not ${showSafe(e.t)}.`);
  },
  array: ({ e, sub, bad }) => {
    e.items.forEach((a, i) => sub(a, `items[${i}]`));
    const n = e.items.length;
    /** @type {Type | null} */
    let item = "unknown";
    for (const a of e.items) item = item === null ? null : strictJoin(item, a.t);
    if (n === 0 || item === null) { bad(n === 0 ? "An array literal has at least one item." : "An array literal's items share one type."); return; }
    if (!(typeof e.t === "object" && "list" in e.t) || !sameType(e.t, { list: item, max: n, len: n })) bad(`An array of ${n} ${showSafe(item)} is ${showSafe({ list: item, max: n, len: n })} with len ${n}, not ${showSafe(e.t)}.`);
  },
  concat: ({ e, sub, bad }) => {
    e.parts.forEach((a, i) => sub(a, `parts[${i}]`));
    /** @type {Type | null} */
    let item = "unknown";
    let max = 0;
    /** @type {number | undefined} */
    let len = 0;
    for (const a of e.parts) {
      if (!(typeof a.t === "object" && "list" in a.t)) { bad(`Only a list is concatenated, not ${showSafe(a.t)}.`); return; }
      item = item === null ? null : strictJoin(item, a.t.list);
      max += a.t.max;
      len = len === undefined || a.t.len === undefined ? undefined : len + a.t.len;
    }
    if (item === "unknown") { bad("A concatenation's item type is unknown."); return; }
    if (e.parts.length === 0 || item === null) { bad(e.parts.length === 0 ? "A concatenation has at least one part." : "A concatenation's parts share one item type."); return; }
    const want = { list: item, max, ...(len === undefined ? {} : { len }) };
    if (!(typeof e.t === "object" && "list" in e.t) || !sameType(e.t, want)) bad(`A concatenation of these parts is ${showSafe(want)}, not ${showSafe(e.t)}.`);
  },
  list: ({ e, bad }) => {
    if (!(typeof e.t === "object" && "list" in e.t) || e.t.len !== undefined) bad(`A new list is a list type without a fixed length, not ${JSON.stringify(e.t)}.`);
  },
  vec: ({ e, sub, bad }) => {
    e.items.forEach((a, i) => sub(a, `items[${i}]`));
    const t = e.t;
    if (!(typeof t === "object" && "vec" in t)) { bad(`A vec node has a vector type, not ${showSafe(t)}.`); return; }
    if (e.items.length !== t.vec) bad(`A ${showSafe(t)} is built from ${t.vec} components, not ${e.items.length}.`);
    e.items.forEach((a, i) => { if (a.t !== t.of && a.t !== "unknown") bad(`Component ${i + 1} of a ${showSafe(t)} is ${t.of}, not ${showSafe(a.t)}.`); });
  },
});

/** A vector's component names, in order; a vector of n components has the first n. */
const COMPONENTS = ["x", "y", "z", "w"];

/**
 * @typedef {(e: Expr, key: string) => Expr} Ex
 */

/** Per statement kind: check its types, bindings and loop rules; push its own effects onto `does`. */
const STMT = /** @type {{ [K in Stmt["k"]]: (x: { c: Checker, s: Extract<Stmt, { k: K }>, path: string, ex: Ex, does: Effect[] }) => void }} */ ({
  let: ({ c, s, path, ex }) => {
    if (s.value) ex(s.value, "value");
    c.type(s.t, `${path}.t`, s.span);
    // A let has its value's type, except that a `let` local may later hold any string, so a string literal's enum widens to str.
    const widens = s.t === "str" && typeof s.value?.t === "object" && "enum" in s.value.t && c.declared.get(s.name)?.kind === "let";
    if (s.value && !sameType(s.value.t, s.t) && !widens) c.report("V002", `'${s.name}' is ${showSafe(s.t)}, but its value is ${showSafe(s.value.t)}.`, path, s.span);
    c.bind(s.name, s.t, path, s.span);
  },
  set: ({ c, s, path, ex }) => {
    ex(s.value, "value");
    const l = c.mutable(s.name, path, s.span);
    if (l && !assignable(s.value.t, l.t)) c.report("V002", `'${s.name}' is ${showSafe(l.t)}, but is set to ${showSafe(s.value.t)}.`, path, s.span);
  },
  store: ({ c, s, path, ex, does }) => {
    does.push(...c.place(s.place, `${path}.place`, s.span));
    ex(s.value, "value");
    if (!s.place.store) c.report("V006", `${s.place.owner}.${s.place.name} is read-only: its place has no store rule.`, path, s.span);
    else if (s.place.total) c.report("V006", `${s.place.owner}.${s.place.name} is a total, which is only bumped: its place has a store rule.`, path, s.span);
    if (!assignable(s.value.t, s.place.t)) c.report("V002", `${s.place.owner}.${s.place.name} is ${showSafe(s.place.t)}, but is stored ${showSafe(s.value.t)}.`, path, s.span);
    does.push(/** @type {Effect} */ (`write ${s.place.owner}.${s.place.name}`));
  },
  bump: ({ c, s, path, ex, does }) => {
    does.push(...c.place(s.place, `${path}.place`, s.span));
    ex(s.value, "value");
    const where = `${s.place.owner}.${s.place.name}`;
    if (!s.place.total) c.report("V006", `${where} is bumped, but its place is not a total.`, path, s.span);
    else if (s.place.store) c.report("V006", `${where} is a total, which is only bumped: its place has a store rule.`, path, s.span);
    if (s.place.t !== "f64" || !assignable(s.value.t, "f64")) c.report("V002", `A bump adds an f64 to an f64 total, not ${showSafe(s.value.t)} to ${showSafe(s.place.t)}.`, path, s.span);
    does.push(/** @type {Effect} */ (`bump ${where}`));
  },
  do: ({ s, ex }) => { ex(s.value, "value"); },
  if: ({ c, s, path, ex }) => {
    ex(s.test, "test");
    if (!assignable(s.test.t, "bool")) c.report("V002", `An if tests a bool, not ${showSafe(s.test.t)}.`, path, s.span);
    c.block(s.then, `${path}.then`);
    c.block(s.else, `${path}.else`);
  },
  for: ({ c, s, path, ex }) => {
    ex(s.init, "init");
    // The counter has its start's type: an f64, or an f32 where the Dialect's number type is f32.
    const counter = s.init.t === "f32" ? "f32" : "f64";
    if (!assignable(s.init.t, counter)) c.report("V002", `A for counter starts at an f64 or an f32, not ${showSafe(s.init.t)}.`, path, s.span);
    const scope = new Set();
    c.scopes.push(scope);
    c.bind(s.name, counter, path, s.span, scope);
    ex(s.test, "test");
    if (!assignable(s.test.t, "bool")) c.report("V002", `A for tests a bool, not ${showSafe(s.test.t)}.`, path, s.span);
    c.loops++;
    c.block(s.update, `${path}.update`);
    c.block(s.body, `${path}.body`);
    c.loops--;
    c.scopes.pop();
    const why = unbounded(s);
    if (why) c.report("V009", `This for is not bounded: ${why}.`, path, s.span);
  },
  each: ({ c, s, path, ex }) => {
    ex(s.list, "list");
    const lt = s.list.t;
    if (!(typeof lt === "object" && "list" in lt)) c.report("V002", `An each runs over a list, not ${showSafe(lt)}.`, path, s.span);
    else {
      if (!sameType(s.t, lt.list)) c.report("V002", `An each over ${showSafe(lt)} binds ${showSafe(lt.list)}, not ${showSafe(s.t)}.`, path, s.span);
      if (s.max !== lt.max) c.report("V009", `An each over a list of at most ${lt.max} runs at most ${lt.max} times, not ${s.max}.`, path, s.span);
    }
    if (!Number.isSafeInteger(s.max) || s.max < 0) c.report("V009", `An each runs a whole number of times, at most 2^53; not ${s.max}.`, path, s.span);
    c.loops++;
    c.scopes.push(new Set());
    c.bind(s.name, s.t, path, s.span);
    c.block(s.body, `${path}.body`);
    c.scopes.pop();
    c.loops--;
  },
  push: ({ c, s, path, ex }) => {
    ex(s.value, "value");
    const l = c.mutable(s.name, path, s.span);
    if (!l) return;
    if (!(typeof l.t === "object" && "list" in l.t)) c.report("V002", `'${s.name}' is ${showSafe(l.t)}, not a list to push onto.`, path, s.span);
    else if (!assignable(s.value.t, l.t.list)) c.report("V002", `'${s.name}' holds ${showSafe(l.t.list)}, not ${showSafe(s.value.t)}.`, path, s.span);
  },
  return: ({ c, s, path, ex }) => {
    const want = c.k.returns;
    if (s.value) ex(s.value, "value");
    const ok = s.value ? assignable(s.value.t, want) : want === "void" || assignable("null", want);
    if (!ok) c.report("V002", `This kernel returns ${showSafe(want)}, not ${s.value ? showSafe(s.value.t) : "nothing"}.`, path, s.span);
  },
  break: ({ c, s, path }) => { if (c.loops === 0) c.report("V010", "A break outside a loop.", path, s.span); },
  continue: ({ c, s, path }) => { if (c.loops === 0) c.report("V010", "A continue outside a loop.", path, s.span); },
});
