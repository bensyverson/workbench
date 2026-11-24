// Builders for hand-written LIR in the verifier's tests. (Node runs every file under test/;
// this one holds no tests.)

/** @import { LExpr, LStmt, LKernel, LProgram, LType, LOp, LUniform } from "../lir.js" */

const SPAN = /** @type {[number, number]} */ ([0, 1]);
const SRC = " ".repeat(100);
const VEC2 = /** @type {LType} */ ({ vec: 2 });
const VEC3 = /** @type {LType} */ ({ vec: 3 });
export { VEC2, VEC3 };

/** @param {number} v */
export const f32 = (v) => /** @type {LExpr} */ ({ k: "num", v: Math.fround(v), t: "f32", span: SPAN });
/** @param {number} v */
export const i32 = (v) => /** @type {LExpr} */ ({ k: "num", v, t: "i32", span: SPAN });
/** @param {boolean} v */
export const bool = (v) => /** @type {LExpr} */ ({ k: "bool", v, t: "bool", span: SPAN });
/** @param {string} name @param {LType} t */
export const local = (name, t = "f32") => /** @type {LExpr} */ ({ k: "local", name, t, span: SPAN });
/** @param {string} name @param {LType} t */
export const uniform = (name, t = "f32") => /** @type {LExpr} */ ({ k: "uniform", name, t, span: SPAN });
/** @param {LOp} op @param {LType} t @param {...LExpr} args */
export const op = (op, t, ...args) => /** @type {LExpr} */ ({ k: "op", op, args, t, span: SPAN });
/** @param {LType} t @param {LExpr} of */
export const conv = (t, of) => /** @type {LExpr} */ ({ k: "conv", of, t, span: SPAN });
/** @param {string} name @param {string} template @param {LType} t @param {LExpr[]} args @param {string} [prelude] */
export const call = (name, template, t, args, prelude) => /** @type {LExpr} */ ({ k: "call", name, spelling: { call: template, ...(prelude ? { prelude } : {}) }, args, t, span: SPAN });
/** @param {string} name @param {LType} t @param {LExpr[]} args */
export const helper = (name, t, args) => /** @type {LExpr} */ ({ k: "helper", name, args, t, span: SPAN });
/** @param {LExpr[]} items */
export const vec = (...items) => /** @type {LExpr} */ ({ k: "vec", items, t: { vec: /** @type {2 | 3 | 4} */ (items.length) }, span: SPAN });
/** @param {LExpr} of @param {string} name */
export const swizzle = (of, name) => /** @type {LExpr} */ ({ k: "swizzle", of, name, t: "f32", span: SPAN });
/** @param {LExpr} test @param {LExpr} then @param {LExpr} els */
export const cond = (test, then, els) => /** @type {LExpr} */ ({ k: "cond", test, then, else: els, t: then.t, span: SPAN });

/** @param {string} name @param {LType} t @param {LExpr | null} value */
export const let_ = (name, t, value) => /** @type {LStmt} */ ({ k: "let", name, t, value, span: SPAN });
/** @param {string} name @param {LExpr} value */
export const set = (name, value) => /** @type {Extract<LStmt, { k: "set" }>} */ ({ k: "set", name, value, span: SPAN });
/** @param {LExpr} test @param {LStmt[]} then @param {LStmt[]} [els] */
export const if_ = (test, then, els = []) => /** @type {LStmt} */ ({ k: "if", test, then, else: els, span: SPAN });
/** @param {string} name @param {number} n @param {LStmt[]} body */
export const for_ = (name, n, body) => /** @type {LStmt} */ ({
  k: "for", name, t: "f32", init: f32(0), test: op("lt", "bool", local(name), f32(n)), bound: `const ${n}`, body, span: SPAN,
  update: [set(name, op("add", "f32", local(name), f32(1)))],
});
/** @param {LExpr} value */
export const ret = (value) => /** @type {LStmt} */ ({ k: "return", value, span: SPAN });
export const brk = /** @type {LStmt} */ ({ k: "break", span: SPAN });

/**
 * Every let and for of `body`, which is what the kernel's locals are.
 * @param {LStmt[]} body
 * @returns {Array<{ name: string, t: LType }>}
 */
function lets(body) {
  return body.flatMap((s) => (s.k === "let" ? [s] : s.k === "for" ? [s, ...lets(s.body)] : s.k === "if" ? [...lets(s.then), ...lets(s.else)] : []));
}

/**
 * @param {{ name?: string, params?: Array<[string, LType]>, returns?: LType, body: LStmt[] }} o
 * @returns {LKernel}
 */
export function kernel({ name = "f", params = [], returns = "f32", body }) {
  return {
    ir: "lir-kernel", name, source: name,
    params: params.map(([n, t]) => ({ name: n, t })),
    returns,
    locals: lets(body).map((s) => ({ name: s.name, t: s.t })),
    body, src: SRC, span: SPAN,
  };
}

/**
 * @param {{ main: LKernel, helpers?: LKernel[], uniforms?: LUniform[], preludes?: Array<{ name: string, text: string }> }} o
 * @returns {LProgram}
 */
export const program = ({ main, helpers = [], uniforms = [], preludes = [] }) => ({ ir: "lir", name: "t", uniforms, preludes, helpers, main });

/** @param {string} name @param {LType} [t] @returns {LUniform} */
export const uniformDecl = (name, t = "f32") => ({ name, t, source: name.replace(/^u_/, "") });
