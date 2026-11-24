// How LIR types, literals and expressions are written in GLSL ES 3.00. Every compound expression
// is parenthesized, so precedence is never at risk; a statement's own expression drops its outer pair.

/** @import { LType, LExpr } from "../../lir/lir.js" */

/**
 * The GLSL name of a type.
 * @param {LType} t
 * @returns {string}
 */
export function glslType(t) {
  if (t === "f32") return "float";
  if (t === "i32") return "int";
  if (t === "bool") return "bool";
  return `vec${t.vec}`;
}

/**
 * An f32 as a GLSL float literal: the fewest digits that read back as the same f32, always with a point or an exponent.
 * @param {number} v  An f32 value.
 * @returns {string}
 */
export function glslFloat(v) {
  if (Object.is(v, -0)) return "(-0.0)";
  let digits = String(v);
  for (let p = 1; p <= 9; p++) {
    const s = Number(v.toPrecision(p));
    if (Math.fround(s) === v) { digits = String(s); break; }
  }
  const text = /[.e]/.test(digits) ? digits : `${digits}.0`;
  return v < 0 ? `(${text})` : text;
}

const BINARY = /** @type {Record<string, string>} */ ({
  add: "+", sub: "-", mul: "*", div: "/", lt: "<", le: "<=", gt: ">", ge: ">=", eq: "==", ne: "!=", and: "&&", or: "||",
});
const UNARY = /** @type {Record<string, string>} */ ({ neg: "-", not: "!" });

/**
 * An expression as the text of a statement's right-hand side: an operator or condition drops its outer pair of parentheses.
 * @param {LExpr} e
 */
export function top(e) {
  const s = expr(e);
  return e.k === "op" || e.k === "cond" ? s.slice(1, -1) : s;
}

/**
 * @param {LExpr} e
 * @returns {string}
 */
export function expr(e) {
  switch (e.k) {
    case "num": return e.t === "i32" ? (e.v < 0 ? `(${e.v})` : String(e.v)) : glslFloat(e.v);
    case "bool": return String(e.v);
    case "local": case "uniform": return e.name;
    case "op": {
      const args = e.args.map(expr);
      if (e.args.length === 2) return `(${args[0]} ${BINARY[e.op]} ${args[1]})`;
      return `(${UNARY[e.op]}${args[0]})`;
    }
    case "conv": return `${glslType(e.t)}(${top(e.of)})`;
    case "call": return e.spelling.call.replace(/\$(\d+)/g, (_, i) => expr(e.args[Number(i)]));
    case "helper": return `${e.name}(${e.args.map(top).join(", ")})`;
    case "vec": return `${glslType(e.t)}(${e.items.map(top).join(", ")})`;
    case "swizzle": return `${expr(e.of)}.${e.name}`;
    case "cond": return `(${expr(e.test)} ? ${expr(e.then)} : ${expr(e.else)})`;
  }
}
