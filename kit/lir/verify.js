// The LIR verifier: checks a program against the invariants the LIR states (lir.d.ts, README.md),
// so the lowering that made it, or a pass that rewrote it, cannot hand a backend something it
// cannot take. Its diagnostics are kit bugs, never the author's: whatever the author wrote that
// cannot lower is refused earlier, by `lowerToLir`. It reads the program alone and never throws.

import { isLType, isVec, sameLType, showLType, COMPONENTS, SAMPLER } from "./types.js";
import { identifierProblem } from "./names.js";
import { OPS, EXPR_FIELDS, STMT_FIELDS } from "./verify-rules.js";

/** @import { LProgram, LKernel, LExpr, LStmt, LType, LirDiagnostic } from "./lir.js" */
/** @import { Span } from "../ir/ir.js" */

/** Each code and the invariant it guards. */
export const LIR_CODES = Object.freeze({
  W001: "A node of no known kind, or missing a field its kind has",
  W002: "A type that disagrees with the node's operands or its kind, or a sampler anywhere but as an argument of a call",
  W003: "A type or literal the LIR cannot hold: f64, an f32 not already rounded, an i32 not whole, a sampler local or return",
  W004: "A name used where nothing binds it, or bound twice",
  W005: "An assignment to a parameter, or of a value of another type",
  W006: "A break or continue outside a loop, or a loop that names no bound",
  W007: "A helper, uniform or spelling that does not match what the node uses it as",
  W008: "A helper declared after the kernel that calls it, or one that calls itself",
  W009: "A node without a span inside the kernel's source",
  W010: "A name that is not a legal identifier in the target",
  W011: "A prelude missing for an intrinsic that needs it, or one nobody uses",
});

/** @typedef {keyof typeof LIR_CODES} LirCode */
/** @typedef {LirDiagnostic & { code: LirCode, path: string }} LirVerifyDiagnostic */

/**
 * Checks `program` against the LIR's invariants. Never throws: anything it cannot read is a W001.
 * @param {LProgram} program
 * @returns {LirVerifyDiagnostic[]}
 */
export function verifyLir(program) {
  /** @type {LirVerifyDiagnostic[]} */
  const out = [];
  try {
    if (typeof program !== "object" || program === null || program.ir !== "lir" || !Array.isArray(program.helpers) || !Array.isArray(program.uniforms) || !Array.isArray(program.preludes) || typeof program.main !== "object" || program.main === null) {
      out.push({ code: "W001", message: "This is not an LIR program: it needs ir 'lir', a main kernel, helpers, uniforms and preludes.", kernel: "", span: null, path: "" });
    } else new Checker(program, out).run();
  } catch (e) {
    out.push({ code: "W001", message: `The verifier could not read this program: ${e instanceof Error ? e.message : String(e)}.`, kernel: "", span: null, path: "" });
  }
  return out;
}

class Checker {
  /**
   * @param {LProgram} program
   * @param {LirVerifyDiagnostic[]} out
   */
  constructor(program, out) {
    this.p = program;
    this.out = out;
    /** @type {Map<string, LType>} */
    this.uniforms = new Map();
    /** Each helper's index in declaration order; main is last. @type {Map<string, number>} */
    this.helpers = new Map();
    /** @type {Set<string>} */
    this.usedPreludes = new Set();
    /** @type {LKernel} */
    this.k = program.main;
    this.index = 0;
    /** The current kernel's parameter names. @type {Set<string>} */
    this.params = new Set();
    /** @type {Map<string, LType>[]} */
    this.scopes = [];
    /** @type {Set<string>} */
    this.declared = new Set();
    this.loops = 0;
  }

  /** @param {LirCode} code @param {string} message @param {string} path @param {unknown} [span] */
  report(code, message, path, span) {
    this.out.push({ code, message, kernel: this.k.source ?? this.k.name, path, span: this.goodSpan(span) ? /** @type {Span} */ (span) : null });
  }

  /** @param {unknown} span */
  goodSpan(span) {
    return Array.isArray(span) && span.length === 2 && Number.isInteger(span[0]) && Number.isInteger(span[1]) && span[0] >= 0 && span[0] <= span[1] && span[1] <= (this.k.src?.length ?? 0);
  }

  /** @param {{ span?: unknown }} node @param {string} path */
  span(node, path) {
    if (!this.goodSpan(node.span)) this.report("W009", "A node needs a span inside its kernel's source.", path);
  }

  run() {
    for (const u of this.p.uniforms) {
      if (!isLType(u.t)) this.report("W003", `Uniform ${u.name} has type ${showLType(u.t)}, which the LIR cannot hold.`, `uniforms.${u.name}`);
      else if (this.uniforms.has(u.name)) this.report("W004", `Uniform ${u.name} is declared twice.`, `uniforms.${u.name}`);
      else this.uniforms.set(u.name, u.t);
    }
    const kernels = [...this.p.helpers, this.p.main];
    kernels.forEach((k, i) => {
      if (this.helpers.has(k.name)) { this.k = k; this.report("W004", `Function ${k.name} is declared twice.`, `kernels[${i}]`); }
      this.helpers.set(k.name, i);
    });
    kernels.forEach((k, i) => this.kernel(k, i));
    this.preludes();
  }

  /** W011, the unused half: each prelude is some call's. */
  preludes() {
    this.k = this.p.main;
    const seen = new Set();
    for (const pre of this.p.preludes) {
      if (seen.has(pre.name)) this.report("W011", `The prelude ${pre.name} is listed twice.`, `preludes.${pre.name}`);
      seen.add(pre.name);
      if (!this.usedPreludes.has(pre.name)) this.report("W011", `The prelude ${pre.name} is used by no call.`, `preludes.${pre.name}`);
    }
  }

  /**
   * @param {LKernel} k
   * @param {number} index  Its place in declaration order.
   */
  kernel(k, index) {
    this.k = k;
    this.index = index;
    this.declared = new Set();
    this.loops = 0;
    const path = index === this.p.helpers.length ? "main" : `helpers[${index}]`;
    this.span(k, path);
    this.identifier(k.name, path);
    if (!isLType(k.returns)) this.report("W003", `The kernel returns ${showLType(k.returns)}, which the LIR cannot hold.`, `${path}.returns`);
    else if (k.returns === SAMPLER) this.report("W003", "The kernel returns a sampler; a sampler is only passed to a call.", `${path}.returns`);
    /** @type {Map<string, LType>} */
    const root = new Map();
    this.scopes = [root];
    k.params.forEach((p, i) => {
      if (!isLType(p.t)) this.report("W003", `Parameter ${p.name} has type ${showLType(p.t)}, which the LIR cannot hold.`, `${path}.params[${i}]`);
      else if (this.declared.has(p.name)) this.report("W004", `${p.name} is bound twice.`, `${path}.params[${i}]`);
      else { this.declared.add(p.name); root.set(p.name, p.t); this.identifier(p.name, `${path}.params[${i}]`); }
    });
    this.params = new Set(k.params.map((p) => p.name));
    this.block(k.body, `${path}.body`);
  }

  /** @param {string} name @param {string} path */
  identifier(name, path) {
    const why = identifierProblem(name);
    if (why) this.report("W010", `The name '${name}' ${why}.`, path);
  }

  /** @param {LStmt[]} stmts @param {string} path */
  block(stmts, path) {
    this.scopes.push(new Map());
    stmts.forEach((s, i) => this.stmt(s, `${path}[${i}]`));
    this.scopes.pop();
  }

  /** @param {string} name @returns {LType | undefined} */
  lookup(name) {
    for (let i = this.scopes.length - 1; i >= 0; i--) { const t = this.scopes[i].get(name); if (t !== undefined) return t; }
    return undefined;
  }

  /** @param {string} name @param {LType} t @param {string} path */
  bind(name, t, path) {
    if (this.declared.has(name)) { this.report("W004", `${name} is bound twice.`, path); return; }
    this.declared.add(name);
    this.identifier(name, path);
    this.scopes[this.scopes.length - 1].set(name, t);
    const listed = this.k.locals.find((l) => l.name === name);
    if (!listed || !sameLType(listed.t, t)) this.report("W004", `${name} is not among the kernel's locals, or listed with another type.`, path);
  }

  /** @param {Record<string, unknown>} node @param {Record<string, string[]>} table @param {string} path */
  shape(node, table, path) {
    const fields = typeof node === "object" && node !== null && typeof node.k === "string" ? table[node.k] : undefined;
    if (!fields) { this.report("W001", `A node of unknown kind${typeof node === "object" && node !== null ? ` '${String(node.k)}'` : ""}.`, path); return false; }
    const missing = fields.filter((f) => !(f in node));
    if (missing.length) { this.report("W001", `A ${node.k} node is missing ${missing.join(", ")}.`, path); return false; }
    return true;
  }

  /** @param {LStmt} s @param {string} path */
  stmt(s, path) {
    if (!this.shape(/** @type {any} */ (s), STMT_FIELDS, path)) return;
    this.span(s, path);
    switch (s.k) {
      case "let": {
        if (!isLType(s.t)) { this.report("W003", `${s.name} has type ${showLType(s.t)}, which the LIR cannot hold.`, path, s.span); return; }
        if (s.t === SAMPLER) { this.report("W003", `${s.name} is a sampler local; only a uniform or a parameter holds a sampler.`, path, s.span); this.bind(s.name, s.t, path); return; }
        const v = s.value === null ? null : this.expr(s.value, `${path}.value`);
        if (v && !sameLType(v, s.t)) this.report("W002", `${s.name} is ${showLType(s.t)} but its value is ${showLType(v)}.`, `${path}.value`, s.span);
        this.bind(s.name, s.t, path);
        return;
      }
      case "set": this.assign(s, path); return;
      case "do": this.expr(s.value, `${path}.value`); return;
      case "if": {
        this.wants(s.test, "bool", "An if's test", `${path}.test`);
        this.block(s.then, `${path}.then`);
        this.block(s.else, `${path}.else`);
        return;
      }
      case "for": {
        if (typeof s.bound !== "string" || s.bound === "") this.report("W006", "A loop names what bounds it.", path, s.span);
        if (!isLType(s.t) || s.t === SAMPLER) { this.report("W003", `The loop variable has type ${showLType(s.t)}, which the LIR cannot hold in a variable.`, path, s.span); return; }
        this.wants(s.init, s.t, "A loop's start", `${path}.init`);
        this.scopes.push(new Map());
        this.bind(s.name, s.t, path);
        this.wants(s.test, "bool", "A loop's test", `${path}.test`);
        s.update.forEach((u, i) => { if (u.k === "set") this.assign(u, `${path}.update[${i}]`); else this.report("W001", "A loop's update is an assignment.", `${path}.update[${i}]`); });
        this.loops++;
        this.block(s.body, `${path}.body`);
        this.loops--;
        this.scopes.pop();
        return;
      }
      case "return": this.wants(s.value, this.k.returns, "A return", `${path}.value`, "W002"); return;
      case "break": case "continue":
        if (this.loops === 0) this.report("W006", `A ${s.k} outside a loop.`, path, s.span);
    }
  }

  /** @param {{ name: string, value: LExpr, span: Span }} s @param {string} path */
  assign(s, path) {
    const v = this.expr(s.value, `${path}.value`);
    const t = this.lookup(s.name);
    if (t === undefined) { this.report("W004", `${s.name} is assigned before anything binds it.`, path, s.span); return; }
    if (this.params.has(s.name)) { this.report("W005", `${s.name} is a parameter, and a parameter is not assigned.`, path, s.span); return; }
    if (v && !sameLType(v, t)) this.report("W005", `${s.name} is ${showLType(t)}, and this assigns it ${showLType(v)}.`, path, s.span);
  }

  /**
   * An expression that must have type `want`.
   * @param {LExpr} e @param {LType} want @param {string} what @param {string} path @param {LirCode} [code]
   */
  wants(e, want, what, path, code = "W002") {
    const t = this.expr(e, path);
    if (t && !sameLType(t, want)) this.report(code, `${what} is ${showLType(want)}, not ${showLType(t)}.`, path, e.span);
  }

  /**
   * Checks `e` and returns its type, or null when it is broken (already reported).
   * @param {LExpr} e
   * @param {string} path
   * @param {boolean} [asArg]  Whether it is an argument of a call or a helper: the one place a sampler may stand.
   * @returns {LType | null}
   */
  expr(e, path, asArg = false) {
    if (!this.shape(/** @type {any} */ (e), EXPR_FIELDS, path)) return null;
    this.span(e, path);
    if (!isLType(e.t)) { this.report("W003", `A ${e.k} node has type ${showLType(e.t)}, which the LIR cannot hold.`, path, e.span); return null; }
    if (e.t === SAMPLER && !asArg) { this.report("W002", `A sampler ${e.k} stands where only a call's argument may: a sampler is only passed whole.`, path, e.span); return null; }
    if (e.t === SAMPLER && e.k !== "uniform" && e.k !== "local") { this.report("W002", `A sampler is a uniform or a parameter, not a ${e.k}.`, path, e.span); return null; }
    const t = e.t;
    switch (e.k) {
      case "num": return this.number(e, path) ? t : null;
      case "bool": return t === "bool" ? t : this.mismatch(e, "bool", path);
      case "local": {
        const bound = this.lookup(e.name);
        if (bound === undefined) { this.report("W004", `${e.name} is used where nothing binds it.`, path, e.span); return null; }
        return sameLType(bound, t) ? t : this.mismatch(e, bound, path);
      }
      case "uniform": {
        const declared = this.uniforms.get(e.name);
        if (declared === undefined) { this.report("W007", `The uniform ${e.name} is not declared.`, path, e.span); return null; }
        if (!sameLType(declared, t)) { this.report("W007", `The uniform ${e.name} is ${showLType(declared)}, and this reads it as ${showLType(t)}.`, path, e.span); return null; }
        return t;
      }
      case "op": return this.operator(e, path);
      case "conv": {
        const from = this.expr(e.of, `${path}.of`);
        if (!from) return null;
        const ok = (from === "f32" && t === "i32") || (from === "i32" && t === "f32");
        if (!ok) { this.report("W002", `A conversion is between f32 and i32, and this takes ${showLType(from)} to ${showLType(t)}.`, path, e.span); return null; }
        return t;
      }
      case "call": return this.callNode(e, path);
      case "helper": return this.helperCall(e, path);
      case "vec": {
        const types = e.items.map((x, i) => this.expr(x, `${path}.items[${i}]`));
        if (types.some((x) => x === null)) return null;
        if (!types.every((x) => x === "f32")) { this.report("W002", "A vector is built of f32 components.", path, e.span); return null; }
        return isVec(t) && t.vec === e.items.length ? t : this.mismatch(e, { vec: /** @type {2 | 3 | 4} */ (e.items.length) }, path);
      }
      case "swizzle": {
        const of = this.expr(e.of, `${path}.of`);
        if (!of) return null;
        if (!isVec(of) || e.name.length !== 1 || !COMPONENTS.slice(0, of.vec).includes(e.name)) { this.report("W002", `${showLType(of)} has no component '${e.name}'.`, path, e.span); return null; }
        return t === "f32" ? t : this.mismatch(e, "f32", path);
      }
      case "cond": {
        this.wants(e.test, "bool", "A condition", `${path}.test`);
        const a = this.expr(e.then, `${path}.then`), b = this.expr(e.else, `${path}.else`);
        if (!a || !b) return null;
        if (!sameLType(a, b) || !sameLType(a, t)) { this.report("W002", `Both branches of a condition are ${showLType(t)}, not ${showLType(a)} and ${showLType(b)}.`, path, e.span); return null; }
        return t;
      }
    }
  }

  /** @param {LExpr} e @param {LType} want @param {string} path @returns {null} */
  mismatch(e, want, path) {
    this.report("W002", `A ${e.k} node is typed ${showLType(e.t)}, and it is ${showLType(want)}.`, path, e.span);
    return null;
  }

  /** @param {Extract<LExpr, { k: "num" }>} e @param {string} path */
  number(e, path) {
    const v = e.v;
    if (typeof v !== "number" || !Number.isFinite(v)) { this.report("W003", "A number literal is finite.", path, e.span); return false; }
    if (e.t === "f32" && Math.fround(v) !== v) { this.report("W003", `The f32 literal ${v} is not already an f32: round it (Math.fround) when lowering.`, path, e.span); return false; }
    if (e.t === "i32" && (!Number.isInteger(v) || v < -(2 ** 31) || v >= 2 ** 31)) { this.report("W003", `The i32 literal ${v} is not a whole number within 32 bits.`, path, e.span); return false; }
    if (e.t !== "f32" && e.t !== "i32") { this.report("W002", `A number is an f32 or an i32, not ${showLType(e.t)}.`, path, e.span); return false; }
    return true;
  }

  /** @param {Extract<LExpr, { k: "op" }>} e @param {string} path */
  operator(e, path) {
    const rule = Object.hasOwn(OPS, e.op) ? OPS[e.op] : undefined;
    if (!rule) { this.report("W001", `An operator '${String(e.op)}' the LIR does not have.`, path, e.span); return null; }
    if (!Array.isArray(e.args)) { this.report("W001", "An op node's args are a list.", path, e.span); return null; }
    const types = e.args.map((a, i) => this.expr(a, `${path}.args[${i}]`));
    if (types.some((x) => x === null)) return null;
    const gives = rule(/** @type {LType[]} */ (types));
    if (typeof gives === "string" && !isLType(gives)) { this.report("W002", `${e.op} ${gives}.`, path, e.span); return null; }
    return sameLType(/** @type {LType} */ (gives), e.t) ? e.t : this.mismatch(e, /** @type {LType} */ (gives), path);
  }

  /** @param {Extract<LExpr, { k: "call" }>} e @param {string} path */
  callNode(e, path) {
    const types = e.args.map((a, i) => this.expr(a, `${path}.args[${i}]`, true));
    const sp = e.spelling;
    if (typeof sp !== "object" || sp === null || typeof sp.call !== "string") { this.report("W007", `The call to ${e.name} has no spelling.`, path, e.span); return null; }
    for (const m of sp.call.matchAll(/\$(\d+)/g)) if (Number(m[1]) >= e.args.length) this.report("W007", `The spelling of ${e.name} uses $${m[1]}, and the call has ${e.args.length} arguments.`, path, e.span);
    if (sp.prelude !== undefined) {
      this.usedPreludes.add(e.name);
      const have = this.p.preludes.find((x) => x.name === e.name);
      if (!have || have.text !== sp.prelude) this.report("W011", `${e.name} needs its prelude defined first, and the program's preludes do not carry it.`, path, e.span);
    }
    return types.some((x) => x === null) ? null : e.t;
  }

  /** @param {Extract<LExpr, { k: "helper" }>} e @param {string} path */
  helperCall(e, path) {
    const types = e.args.map((a, i) => this.expr(a, `${path}.args[${i}]`, true));
    const at = this.helpers.get(e.name);
    const callee = at === undefined ? undefined : [...this.p.helpers, this.p.main][at];
    if (at === undefined || !callee) { this.report("W007", `There is no helper ${e.name}.`, path, e.span); return null; }
    if (at >= this.index) { this.report("W008", `${e.name} is declared at or after the kernel that calls it, and a target that declares before use (and has no recursion) cannot take it.`, path, e.span); return null; }
    if (callee.params.length !== e.args.length) { this.report("W007", `${e.name} takes ${callee.params.length} arguments, not ${e.args.length}.`, path, e.span); return null; }
    if (types.some((x) => x === null)) return null;
    const bad = callee.params.findIndex((p, i) => !sameLType(p.t, /** @type {LType} */ (types[i])));
    if (bad >= 0) { this.report("W007", `Argument ${bad} of ${e.name} is ${showLType(callee.params[bad].t)}, not ${showLType(/** @type {LType} */ (types[bad]))}.`, path, e.span); return null; }
    if (!sameLType(callee.returns, e.t)) { this.report("W007", `${e.name} returns ${showLType(callee.returns)}, not ${showLType(e.t)}.`, path, e.span); return null; }
    return e.t;
  }
}
