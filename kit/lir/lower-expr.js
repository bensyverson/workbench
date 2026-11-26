// Core IR expressions to LIR expressions. Each returns null when it could not lower (the reason is
// reported), and a parent never reports a second time for what a child already did.

import { showType } from "../ir/types.js";

/** @import { Expr, Type } from "../ir/ir.js" */
/** @import { LExpr, LOp, LType, Spelling } from "./lir.js" */
/** @import { Ctx } from "./state.js" */

/** Operators that map to the LIR's by name. */
const DIRECT = new Set(["add", "sub", "mul", "div", "neg", "lt", "le", "gt", "ge", "eq", "ne", "not", "and", "or"]);

/** The spelling of an operator the LIR has no operator for: the target's own function, with its prelude when it needs one. */
const WRITTEN_OUT = /** @type {Record<string, { name: string, spelling: Spelling }>} */ ({
  pow: { name: "pow", spelling: { call: "pow($0, $1)" } },
});

/** JavaScript's `!!x` on an f32: false for zero and for NaN, which a bare `x != 0.0` would call true (best effort: GLSL ES 3.00 leaves NaN to the driver). */
const TRUTHY = { name: "truthy", spelling: { call: "wb_truthy($0)", prelude: "bool wb_truthy(float x) {\n  return x != 0.0 && !isnan(x);\n}\n" } };

/** @param {Type} t */
const isF64 = (t) => t === "f64" || (typeof t === "object" && "vec" in t && t.of === "f64");

/**
 * @param {Ctx} cx
 * @param {Expr} e
 * @returns {LExpr | null}
 */
export function lowerExpr(cx, e) {
  const span = e.span;
  switch (e.k) {
    case "num": {
      if (e.t !== "f32") return cx.f64(`the literal ${e.v}, outside an f32 conversion`, span);
      return { k: "num", v: e.v, t: "f32", span };
    }
    case "bool": return { k: "bool", v: e.v, t: "bool", span };
    case "local": {
      if (cx.uniformParams.has(e.name)) { cx.report("R002", `it uses the uniforms object '${e.name}' other than to read a member of it`, span); return null; }
      const v = cx.vars.get(e.name);
      return v?.t ? { k: "local", name: v.name, t: v.t, span } : null;
    }
    case "load": return loadUniform(cx, e, false);
    case "op": return operator(cx, e);
    case "cond": {
      const [test, then, els] = [e.test, e.then, e.else].map((x) => lowerExpr(cx, x));
      const t = cx.type(e.t, span, "a condition's value");
      return test && then && els && t ? { k: "cond", test, then, else: els, t, span } : null;
    }
    case "call": return call(cx, e);
    case "helper": return helper(cx, e);
    case "vec": {
      const items = e.items.map((x) => lowerExpr(cx, x));
      const t = cx.type(e.t, span, "a vector");
      return t && items.every((x) => x !== null) ? { k: "vec", items: /** @type {LExpr[]} */ (items), t, span } : null;
    }
    case "field": {
      const of = lowerExpr(cx, e.of);
      if (!of) return null;
      if (typeof of.t === "object" && e.name.length === 1 && "xyzw".slice(0, of.t.vec).includes(e.name)) return { k: "swizzle", of, name: e.name, t: "f32", span };
      cx.report("R002", `it reads the field '${e.name}' of ${showType(e.of.t)}, and only a vector's components (x, y, z, w) have a form in the LIR`, span);
      return null;
    }
    default:
      cx.report("R002", `it uses ${describe(e)}, which has no form in the LIR (f32, i32, bool and vectors of f32)`, span);
      return null;
  }
}

/** @param {Expr} e */
function describe(e) {
  switch (e.k) {
    case "str": return "a string";
    case "null": case "undef": return "null or undefined";
    case "array": case "concat": case "list": case "index": return "a list";
    case "struct": return "a struct";
    case "global": return `the global '${e.name}'`;
    case "method": return `the method ${e.owner}.${e.name}`;
    default: return `a ${e.k}`;
  }
}

/**
 * A read of a uniform's member. `narrowing` is set when an f32 conversion asks for it, which is the one place an f64 may be read.
 * @param {Ctx} cx
 * @param {Extract<Expr, { k: "load" }>} e
 * @param {boolean} narrowing
 * @returns {LExpr | null}
 */
function loadUniform(cx, e, narrowing) {
  const { place, span } = e;
  const owner = place.recv.k === "local" ? cx.uniformParams.get(place.recv.name) : undefined;
  if (owner === undefined) {
    cx.report("R002", `it reads ${place.owner}.${place.name}, which is state, and a shader has only its uniforms`, span);
    return null;
  }
  const u = cx.state.uniforms.get(`${owner}.${place.name}`);
  if (!u) { cx.report("R005", `it reads ${owner}.${place.name}, which is not a uniform the program declares (or has no form in the LIR)`, span); return null; }
  if (isF64(place.t) && !narrowing) return cx.f64(`${owner}.${place.name}, read without an f32 conversion`, span);
  return { k: "uniform", name: u.name, t: u.t, span };
}

/**
 * The `f32` operator on an f64: the one explicit narrowing. It takes a literal (rounded here) or a uniform the host
 * supplies as an f64 (rounded at upload); an f64 computed in the Kernel stays refused, since its precision is its meaning.
 * @param {Ctx} cx
 * @param {Extract<Expr, { k: "op" }>} e
 * @returns {LExpr | null}
 */
function narrow(cx, e) {
  const [a] = e.args;
  if (a.k === "num" && isF64(a.t)) {
    const v = Math.fround(a.v);
    if (!Number.isFinite(v)) return cx.f64(`the literal ${a.v}, which is out of the range of an f32`, a.span);
    return { k: "num", v, t: "f32", span: e.span };
  }
  if (a.k === "load" && isF64(a.t)) {
    const u = loadUniform(cx, a, true);
    return u ? { ...u, span: e.span } : null;
  }
  if (a.t === "f32") return lowerExpr(cx, a);
  if (a.k === "local" && cx.vars.get(a.name)?.t === null) return null;
  return cx.f64(`${a.k === "op" ? `the result of ${a.op}` : `a ${a.k}`}, narrowed by f32(…): only a literal or a uniform may be narrowed, since an f64 computed in the Kernel has its meaning in its precision`, a.span);
}

/**
 * @param {Ctx} cx
 * @param {Extract<Expr, { k: "op" }>} e
 * @returns {LExpr | null}
 */
function operator(cx, e) {
  const { span } = e;
  if (e.op === "f32") return narrow(cx, e);
  if (isF64(e.t) || e.args.some((a) => isF64(a.t))) {
    cx.report("R001", `it computes in f64 (${e.op}), so its meaning depends on f64 precision, and GLSL ES 3.00 has no f64; compute in f32`, span);
    return null;
  }
  if ((e.op === "eq" || e.op === "ne") && e.args.some((a) => typeof a.t === "object" && "enum" in a.t)) return choiceCompare(cx, e);
  const args = e.args.map((a) => lowerExpr(cx, a));
  if (args.some((a) => a === null)) return null;
  const as = /** @type {LExpr[]} */ (args);
  const t = cx.type(e.t, span, `the result of ${e.op}`);
  if (!t) return null;
  if (DIRECT.has(e.op)) return { k: "op", op: /** @type {LOp} */ (e.op), args: as, t, span };
  const out = WRITTEN_OUT[e.op];
  if (out) return bound(cx, out.name, out.spelling, as, t, span);
  if (e.op === "pos") return as[0];
  if (e.op === "truthy") {
    if (as[0].t === "bool") return as[0];
    if (as[0].t === "f32") return bound(cx, TRUTHY.name, TRUTHY.spelling, as, t, span);
  }
  if (e.op === "rem") {
    cx.report("R006", "it uses % on f32, and GLSL ES 3.00 cannot reproduce JavaScript's %: its mod floors, and x - y * trunc(x / y) rounds differently for a non-integer divisor (and can take the wrong sign); use the Library's pmod(x, n), which floors, or fract", span);
    return null;
  }
  cx.report("R002", `it uses the operator ${e.op} on ${e.args.map((a) => showType(a.t)).join(" and ")}, which has no form in the LIR`, span);
  return null;
}

/**
 * `choice === "grey"`: a choice is an i32 ordinal, and the option is that ordinal, so the comparison is of two i32s.
 * @param {Ctx} cx
 * @param {Extract<Expr, { k: "op" }>} e
 * @returns {LExpr | null}
 */
function choiceCompare(cx, e) {
  const { span } = e;
  const options = e.args.map((a) => (typeof a.t === "object" && "enum" in a.t && a.t.declared ? a.t.enum : null)).find((o) => o !== null);
  if (!options) { cx.report("R002", "it compares strings, and only a choice declared by the Dialect has a form in the LIR", span); return null; }
  const sides = e.args.filter((a) => a.k !== "str").map((a) => (typeof a.t === "object" && "enum" in a.t ? a.t.enum : null));
  if (sides.length === 2 && sides[0] && sides[1] && sides[0].join("\0") !== sides[1].join("\0")) {
    cx.report("R002", `it compares two choices whose options differ (${sides[0].join(", ")} and ${sides[1].join(", ")}), and a choice is its option's index, so the comparison would be of indices of different lists`, span);
    return null;
  }
  const args = e.args.map((a) => {
    if (a.k !== "str") return lowerExpr(cx, a);
    const at = options.indexOf(a.v);
    if (at < 0) { cx.report("R002", `it compares a choice with "${a.v}", which is none of its options (${options.join(", ")})`, a.span); return null; }
    return /** @type {LExpr} */ ({ k: "num", v: at, t: "i32", span: a.span });
  });
  return args.every((a) => a !== null) ? { k: "op", op: /** @type {LOp} */ (e.op), args: /** @type {LExpr[]} */ (args), t: "bool", span } : null;
}

/**
 * An intrinsic bound to its spelling, its prelude joining the program's.
 * @param {Ctx} cx
 * @param {string} name
 * @param {Spelling} spelling
 * @param {LExpr[]} args
 * @param {LType} t
 * @param {import("../ir/ir.js").Span} span
 * @returns {LExpr}
 */
function bound(cx, name, spelling, args, t, span) {
  if (spelling.prelude !== undefined && !cx.state.preludes.has(name)) cx.state.preludes.set(name, spelling.prelude);
  return { k: "call", name, spelling, args, t, span };
}

/**
 * @param {Ctx} cx
 * @param {Extract<Expr, { k: "call" }>} e
 * @returns {LExpr | null}
 */
function call(cx, e) {
  const { span } = e;
  const bare = e.recv === undefined || (e.recv.k === "global" && e.recv.name === e.fn);
  if (!bare) { cx.report("R002", `it calls ${e.fn} on a receiver, and only a Dialect's bare intrinsics have a spelling`, span); return null; }
  const spelling = cx.state.spell(e.fn);
  if (!spelling) { cx.report("R003", `it calls ${e.fn}, an intrinsic with no GLSL spelling`, span); return null; }
  const args = e.args.map((a) => lowerExpr(cx, a));
  const t = cx.type(e.t, span, `the result of ${e.fn}`);
  return t && args.every((a) => a !== null) ? bound(cx, e.fn, spelling, /** @type {LExpr[]} */ (args), t, span) : null;
}

/**
 * A call of a helper: the helper is lowered first, so the order of `helpers` is callees first.
 * @param {Ctx} cx
 * @param {Extract<Expr, { k: "helper" }>} e
 * @returns {LExpr | null}
 */
function helper(cx, e) {
  const { span } = e;
  const args = e.args.map((a) => lowerExpr(cx, a));
  const t = cx.type(e.t, span, `the result of ${e.name}`);
  const callee = cx.state.kernels.get(e.name);
  if (!callee) { cx.report("R004", `it calls ${e.name}, which is not a helper of this program`, span); return null; }
  if (cx.state.visiting.has(e.name) || e.name === cx.kernel.name) { cx.report("R004", `it calls ${e.name} from within ${e.name}'s own calls, and GLSL has no recursion`, span); return null; }
  cx.state.lowerHelper(e.name);
  return t && args.every((a) => a !== null) ? { k: "helper", name: cx.state.fnNames.get(e.name) ?? e.name, args: /** @type {LExpr[]} */ (args), t, span } : null;
}
