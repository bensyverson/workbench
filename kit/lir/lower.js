// The lowering from the core IR to the LIR: statements and Kernels, the program's uniforms,
// helpers (callee first) and preludes. Expressions are in lower-expr.js. The result is verified
// before it is returned, so what a backend reads has kept every LIR invariant.

import { State, Ctx } from "./state.js";
import { lowerExpr } from "./lower-expr.js";
import { safeName, uniformName } from "./names.js";
import { verifyLir } from "./verify.js";

/** @import { Kernel, Stmt, Type } from "../ir/ir.js" */
/** @import { LProgram, LKernel, LStmt, LParam, LType, LirDiagnostic } from "./lir.js" */
/** @import { LirInput, LirOptions } from "./state.js" */

/**
 * @typedef {object} LirResult
 * @property {LProgram | null} program  Null when anything was refused.
 * @property {LirDiagnostic[]} diagnostics  Why the Kernels cannot lower (R codes, read after "cannot take `<kernel>`:"), or the verifier's findings (W codes: a kit bug).
 */

/**
 * Lowers `input.main` and the helpers it reaches to an LIR program, or says why it cannot.
 * @param {LirInput} input
 * @param {LirOptions} options
 * @returns {LirResult}
 */
export function lowerToLir(input, options) {
  const state = new State(input, options);
  for (const h of input.helpers) state.kernels.set(h.name, h);
  /** @type {Set<string>} */
  const functions = new Set();
  for (const k of [input.main, ...input.helpers]) state.fnNames.set(k.name, safeName(k.name, functions));
  declareUniforms(state);
  state.lowerHelper = (name) => {
    if (state.done.has(name) || state.visiting.has(name)) return;
    const k = /** @type {Kernel} */ (state.kernels.get(name));
    state.visiting.add(name);
    const lowered = lowerKernel(state, k, functions, false);
    state.visiting.delete(name);
    state.done.add(name);
    if (lowered) state.order.push(lowered);
  };
  const main = lowerKernel(state, input.main, functions, true);
  if (state.diagnostics.length || !main) return { program: null, diagnostics: state.diagnostics };
  /** @type {LProgram} */
  const program = {
    ir: "lir", name: input.name, uniforms: [...state.uniforms.values()],
    preludes: [...state.preludes].map(([name, text]) => ({ name, text })),
    helpers: state.order, main,
  };
  const broken = verifyLir(program);
  if (broken.length) return { program: null, diagnostics: broken.map((d) => ({ code: d.code, message: `${d.message} (${d.path || "program"}; this is a kit bug, not the author's)`, kernel: d.kernel, span: d.span })) };
  return { program, diagnostics: [] };
}

/**
 * The uniforms of the objects the entry Kernel takes as parameters: every member with a form in the LIR.
 * @param {State} state
 */
function declareUniforms(state) {
  /** @type {Set<string>} */
  const taken = new Set();
  for (const p of state.input.main.params) {
    const owner = objectName(p.t);
    const members = owner === null ? undefined : state.input.uniforms[owner];
    if (owner === null || !members) continue;
    for (const [name, t] of Object.entries(members)) {
      const lt = uniformType(t);
      if (lt) state.uniforms.set(`${owner}.${name}`, { name: uniformName(name, taken), t: lt.t, source: name, ...(lt.options ? { options: lt.options } : {}), ...(lt.host ? { host: lt.host } : {}) });
    }
  }
}

/** @param {Type} t @returns {string | null} */
const objectName = (t) => (typeof t === "object" && "obj" in t ? t.obj : null);

/**
 * What a uniform of core type `t` is in the LIR, or null when none: an f32, a bool, a choice (an index), a vector of f32,
 * or an f64 the host supplies and the upload narrows.
 * @param {Type} t
 * @returns {{ t: LType, options?: string[], host?: "f64" } | null}
 */
function uniformType(t) {
  if (t === "f32" || t === "bool") return { t };
  if (t === "f64") return { t: "f32", host: "f64" };
  if (typeof t === "object" && "enum" in t && t.declared) return { t: "i32", options: [...t.enum] };
  if (typeof t === "object" && "vec" in t && t.of === "f32") return { t: { vec: t.vec } };
  return null;
}

/**
 * Names every variable of `k`, then lowers its body.
 * @param {State} state
 * @param {Kernel} k
 * @param {Set<string>} functions  The function names in use, which no variable may take.
 * @param {boolean} isMain  The entry Kernel drops its uniform-object parameters: they are the program's uniforms.
 * @returns {LKernel | null}
 */
function lowerKernel(state, k, functions, isMain) {
  const cx = new Ctx(state, k);
  const taken = new Set([...functions, ...callNames(k.body)]);
  cx.taken = taken;
  /** @type {LParam[]} */
  const params = [];
  for (const p of k.params) {
    const owner = objectName(p.t);
    if (isMain && owner !== null && state.input.uniforms[owner]) { cx.uniformParams.set(p.name, owner); continue; }
    const t = cx.type(p.t, k.span, `parameter ${p.name}`);
    const v = { name: safeName(p.name, taken), t };
    cx.vars.set(p.name, v);
    if (t) params.push({ name: v.name, t });
  }
  for (const l of k.locals) declare(cx, l.name, l.t);
  const returns = cx.type(k.returns, k.span, "the return value");
  const body = block(cx, k.body);
  if (!returns) return null;
  /** @type {LParam[]} */
  const locals = [];
  for (const [core, v] of cx.vars) if (v.t && !k.params.some((p) => p.name === core)) locals.push({ name: v.name, t: v.t });
  return { ir: "lir-kernel", name: state.fnNames.get(k.name) ?? k.name, source: k.name, params, returns, locals, body, src: k.src, span: k.span };
}

/**
 * Gives variable `name` its LIR name and type, once.
 * @param {Ctx} cx
 * @param {string} name
 * @param {Type} t
 */
function declare(cx, name, t) {
  if (cx.vars.has(name)) return;
  cx.vars.set(name, { name: safeName(name, cx.taken), t: cx.type(t, cx.kernel.span, `variable ${name}`) });
}

/**
 * The names of the intrinsics a body calls: a variable of the same name would hide the function.
 * @param {unknown} x
 * @param {Set<string>} [out]
 * @returns {Set<string>}
 */
function callNames(x, out = new Set()) {
  if (Array.isArray(x)) x.forEach((i) => callNames(i, out));
  else if (typeof x === "object" && x !== null) {
    const o = /** @type {Record<string, unknown>} */ (x);
    if (o.k === "call" && typeof o.fn === "string") out.add(o.fn);
    for (const [key, v] of Object.entries(o)) if (key !== "t" && key !== "span") callNames(v, out);
  }
  return out;
}

/**
 * @param {Ctx} cx
 * @param {Stmt[]} stmts
 * @returns {LStmt[]}
 */
function block(cx, stmts) {
  /** @type {LStmt[]} */
  const out = [];
  for (const s of stmts) {
    const r = stmt(cx, s);
    if (r) out.push(r);
  }
  return out;
}

/**
 * @param {Ctx} cx
 * @param {Stmt} s
 * @returns {LStmt | null}
 */
function stmt(cx, s) {
  const { span } = s;
  switch (s.k) {
    case "let": {
      declare(cx, s.name, s.t);
      const v = cx.vars.get(s.name);
      if (!v?.t) return null;
      const value = s.value === null ? null : lowerExpr(cx, s.value);
      return s.value !== null && !value ? null : { k: "let", name: v.name, t: v.t, value, span };
    }
    case "set": return assignment(cx, s);
    case "do": {
      const value = lowerExpr(cx, s.value);
      return value ? { k: "do", value, span } : null;
    }
    case "if": {
      const test = lowerExpr(cx, s.test);
      const [then, els] = [block(cx, s.then), block(cx, s.else)];
      return test ? { k: "if", test, then, else: els, span } : null;
    }
    case "for": {
      declare(cx, s.name, s.init.t);
      const v = cx.vars.get(s.name);
      const init = lowerExpr(cx, s.init), test = lowerExpr(cx, s.test);
      const update = s.update.map((u) => (u.k === "set" ? assignment(cx, u) : null));
      const body = block(cx, s.body);
      const sets = /** @type {Array<Extract<LStmt, { k: "set" }>>} */ (update);
      return v?.t && init && test && update.every((u) => u !== null) ? { k: "for", name: v.name, t: v.t, init, test, update: sets, body, bound: s.bound, span } : null;
    }
    case "return": {
      if (s.value === null) { cx.report("R002", "it returns nothing, and a function of the LIR returns a value", span); return null; }
      const value = lowerExpr(cx, s.value);
      return value ? { k: "return", value, span } : null;
    }
    case "break": case "continue": return { k: s.k, span };
    case "store": cx.report("R002", `it writes ${s.place.owner}.${s.place.name}, and nothing in a shader holds state`, span); return null;
    case "each": cx.report("R002", "it loops over a list, and lists have no form in the LIR", span); return null;
    case "push": cx.report("R002", "it pushes onto a list, and lists have no form in the LIR", span); return null;
  }
}

/**
 * @param {Ctx} cx
 * @param {Extract<Stmt, { k: "set" }>} s
 * @returns {Extract<LStmt, { k: "set" }> | null}
 */
function assignment(cx, s) {
  const v = cx.vars.get(s.name);
  const value = lowerExpr(cx, s.value);
  return v?.t && value ? { k: "set", name: v.name, value, span: s.span } : null;
}
