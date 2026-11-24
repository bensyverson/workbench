// Builders for hand-written IR in the interpreter's tests. Every kernel `kernel()` makes is
// run through the verifier, so a test cannot pass over a kernel the IR would reject.
// (Node runs every file under test/; this one holds no tests.)
import assert from "node:assert/strict";
import { verify } from "../../ir/verify.js";

/** @import { Expr, Stmt, Type, Kernel, Local, Place, Op, Coerce, Effect } from "../../ir/ir.js" */

const SPAN = /** @type {[number, number]} */ ([0, 1]);

/** A kernel's source: long enough that every span the builders write is inside it. */
const SRC = " ".repeat(100);

/** @param {number} v @param {Type} [t] */
export const num = (v, t = "f64") => /** @type {Expr} */ ({ k: "num", v, t, span: SPAN });
/** @param {number} v */
export const f32 = (v) => num(Math.fround(v), "f32");
/** @param {string} v */
export const str = (v) => /** @type {Expr} */ ({ k: "str", v, t: { enum: [v] }, span: SPAN });
/** @param {boolean} v */
export const bool = (v) => /** @type {Expr} */ ({ k: "bool", v, t: "bool", span: SPAN });
export const nul = /** @type {Expr} */ ({ k: "null", t: "null", span: SPAN });
export const undef = /** @type {Expr} */ ({ k: "undef", t: { opt: { ref: "E" } }, span: SPAN });
/** @param {string} name @param {Type} t */
export const local = (name, t = "f64") => /** @type {Expr} */ ({ k: "local", name, t, span: SPAN });
/** @param {string} name @param {Type} t */
export const global = (name, t) => /** @type {Expr} */ ({ k: "global", name, t, span: SPAN });
/** @param {Op} op @param {Type} t @param {...Expr} args */
export const op = (op, t, ...args) => /** @type {Expr} */ ({ k: "op", op, args, t, span: SPAN });
/** @param {Expr} test @param {Expr} then @param {Expr} els @param {Type} t */
export const cond = (test, then, els, t) => /** @type {Expr} */ ({ k: "cond", test, then, else: els, t, span: SPAN });
/** @param {Expr[]} items @param {"f32" | "f64"} of @param {string} [name] */
export const vec = (items, of = "f32", name) => /** @type {Expr} */ ({ k: "vec", items, t: { vec: /** @type {2 | 3 | 4} */ (items.length), of, ...(name ? { name } : {}) }, span: SPAN });
/** @param {Expr} of @param {string} name @param {Type} t */
export const field = (of, name, t) => /** @type {Expr} */ ({ k: "field", of, name, t, span: SPAN });
/** @param {Expr} of @param {Expr} index @param {Type} t */
export const index = (of, index, t) => /** @type {Expr} */ ({ k: "index", of, index, t, span: SPAN });
/** @param {Expr[]} items @param {Type} item */
export const array = (items, item) => /** @type {Expr} */ ({ k: "array", items, t: { list: item, max: items.length, len: items.length }, span: SPAN });
/** @param {Type} item @param {number} max */
export const list = (item, max) => /** @type {Expr} */ ({ k: "list", t: { list: item, max }, span: SPAN });
/** @param {Record<string, Expr>} fields */
export const struct = (fields) => /** @type {Expr} */ ({ k: "struct", fields, t: { struct: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v.t])) }, span: SPAN });
/** @param {Expr} recv @param {string} owner @param {string} name @param {Type} t @param {Coerce} [store] */
export const place = (recv, owner, name, t, store) => /** @type {Place} */ ({ recv, owner, name, t, ...(store ? { store } : {}) });
/** @param {Place} p */
export const load = (p) => /** @type {Expr} */ ({ k: "load", place: p, t: p.t, span: SPAN });
/** @param {string} fn @param {Type} t @param {Expr[]} args @param {{ recv?: Expr, effects?: Effect[] }} [o] */
export const call = (fn, t, args, o = {}) => /** @type {Expr} */ ({ k: "call", fn, args, t, effects: o.effects ?? [], ...(o.recv ? { recv: o.recv } : {}), span: SPAN });
/** @param {string} owner @param {string} name @param {Expr} recv @param {Type} t @param {Expr[]} args */
export const method = (owner, name, recv, t, args) => /** @type {Expr} */ ({ k: "method", owner, name, recv, args, t, effects: [`call ${owner}.${name}`], span: SPAN });
/** @param {string} name @param {Type} t @param {Expr[]} args */
export const helper = (name, t, args) => /** @type {Expr} */ ({ k: "helper", name, args, t, effects: [`call ${name}`], span: SPAN });

/** @param {string} name @param {Type} t @param {Expr | null} value @param {Effect[]} [effects] */
export const let_ = (name, t, value, effects = []) => /** @type {Stmt} */ ({ k: "let", name, t, value, effects, span: SPAN });
/** @param {string} name @param {Expr} value @param {Effect[]} [effects] */
export const set = (name, value, effects = []) => /** @type {Stmt} */ ({ k: "set", name, value, effects, span: SPAN });
/** @param {Place} p @param {Expr} value */
export const store = (p, value) => /** @type {Stmt} */ ({ k: "store", place: p, value, effects: [`write ${p.owner}.${p.name}`], span: SPAN });
/** @param {Expr} value @param {Effect[]} [effects] */
export const do_ = (value, effects = []) => /** @type {Stmt} */ ({ k: "do", value, effects, span: SPAN });
/** @param {Expr} test @param {Stmt[]} then @param {Stmt[]} [els] */
export const if_ = (test, then, els = []) => /** @type {Stmt} */ ({ k: "if", test, then, else: els, effects: [], span: SPAN });
/** `for (let name = 0; name < n; name = name + 1)`. */
export const for_ = (/** @type {string} */ name, /** @type {number} */ n, /** @type {Stmt[]} */ body) => /** @type {Stmt} */ ({
  k: "for", name, init: num(0), test: op("lt", "bool", local(name), num(n)), bound: `const ${n}`, body, effects: [], span: SPAN,
  update: [set(name, op("add", "f64", local(name), num(1)))],
});
/** @param {string} name @param {Type} t @param {Expr} listExpr @param {number} max @param {Stmt[]} body */
export const each = (name, t, listExpr, max, body) => /** @type {Stmt} */ ({ k: "each", name, t, list: listExpr, max, body, effects: [], span: SPAN });
/** @param {string} name @param {Expr} value */
export const push = (name, value) => /** @type {Stmt} */ ({ k: "push", name, value, effects: [], span: SPAN });
/** @param {Expr | null} value */
export const ret = (value) => /** @type {Stmt} */ ({ k: "return", value, effects: [], span: SPAN });
export const brk = /** @type {Stmt} */ ({ k: "break", effects: [], span: SPAN });
export const cont = /** @type {Stmt} */ ({ k: "continue", effects: [], span: SPAN });

/**
 * Every let, for and each in `body`, as the kernel's locals.
 * @param {Stmt[]} body
 * @returns {Local[]}
 */
function localsOf(body) {
  /** @type {Local[]} */
  const out = [];
  for (const s of body) {
    if (s.k === "let") out.push({ name: s.name, t: s.t, kind: "let" });
    if (s.k === "for") { out.push({ name: s.name, t: "f64", kind: "let" }, ...localsOf(s.body)); }
    if (s.k === "each") out.push({ name: s.name, t: s.t, kind: "let" }, ...localsOf(s.body));
    if (s.k === "if") out.push(...localsOf(s.then), ...localsOf(s.else));
  }
  return out;
}

/**
 * The effects the expressions under `x` perform: a call's own, and a read of a writable place.
 * @param {unknown} x
 * @param {Effect[]} [out]
 * @returns {Effect[]}
 */
function exprEffects(x, out = []) {
  if (Array.isArray(x)) x.forEach((i) => exprEffects(i, out));
  else if (x && typeof x === "object") {
    const o = /** @type {Record<string, any>} */ (x);
    if (o.k === "load") {
      exprEffects(o.place.recv, out);
      if (o.place.store) out.push(`read ${o.place.owner}.${o.place.name}`);
    } else {
      for (const [key, v] of Object.entries(o)) if (key !== "t" && key !== "span" && key !== "effects") exprEffects(v, out);
      if (o.k === "call" || o.k === "method" || o.k === "helper") out.push(...o.effects);
    }
  }
  return out;
}

/**
 * Fills in each statement's effects from its own expressions, and returns the kernel's (depth first, deduplicated).
 * @param {Stmt[]} body
 * @returns {Effect[]}
 */
function fillEffects(body) {
  /** @type {Effect[]} */
  const all = [];
  for (const s of body) {
    const own = s.k === "store" ? [...exprEffects(s.place.recv), ...exprEffects(s.value), `write ${s.place.owner}.${s.place.name}`]
      : s.k === "if" ? exprEffects(s.test)
        : s.k === "for" ? [...exprEffects(s.init), ...exprEffects(s.test)]
          : s.k === "each" ? exprEffects(s.list)
            : "value" in s ? exprEffects(s.value) : [];
    s.effects = /** @type {Effect[]} */ ([...new Set(own)]);
    all.push(...s.effects);
    if (s.k === "if") all.push(...fillEffects(s.then), ...fillEffects(s.else));
    if (s.k === "for") all.push(...fillEffects(s.update), ...fillEffects(s.body));
    if (s.k === "each") all.push(...fillEffects(s.body));
  }
  return /** @type {Effect[]} */ ([...new Set(all)]);
}

/**
 * A verified kernel. Its statements' effects and its own are worked out from what the body does.
 * @param {{ name?: string, params?: Array<[string, Type]>, returns?: Type, body: Stmt[] }} o
 * @returns {Kernel}
 */
export function kernel({ name = "t#0", params = [], returns = "void", body }) {
  const k = /** @type {Kernel} */ ({
    ir: "kernel", name, slot: "test", space: "test",
    params: params.map(([n, t]) => ({ name: n, t, kind: "param" })),
    returns, locals: localsOf(body), body, effects: fillEffects(body), src: SRC, span: SPAN,
  });
  assert.deepEqual(verify(k).map((d) => `${d.code} ${d.path} ${d.message}`), [], `${name} must be a valid kernel`);
  return k;
}

/**
 * A kernel that returns one expression.
 * @param {Expr} e
 * @param {Array<[string, Type]>} [params]
 */
export const returning = (e, params = []) => kernel({ params, returns: e.t, body: [ret(e)] });
