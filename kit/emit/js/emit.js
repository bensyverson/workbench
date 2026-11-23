// The JavaScript backend: an IR kernel to the source of a plain function whose
// parameters are the lambda's own, so it drops into the slot the lambda filled.
// Every emitted line records the source span it came from.

import { LineTable } from "../../parse/lexer.js";

/** @import { Kernel, Stmt, Expr, Op, Span } from "../../ir/ir.js" */
/** @import { Position } from "../../parse/ast.js" */

/**
 * @typedef {object} LineMap
 * @property {Span} span       The source span, in the kernel's `src`, this line came from.
 * @property {Position} start  Where that span starts in the lambda's source.
 */

/**
 * @typedef {object} Emitted
 * @property {string} name      A JS identifier derived from the kernel's name.
 * @property {string[]} params
 * @property {string} source    A function expression.
 * @property {LineMap[]} lines  One entry per line of `source`.
 */

const BINARY = /** @type {Partial<Record<Op, string>>} */ ({
  add: "+", concat: "+", sub: "-", mul: "*", div: "/", rem: "%", pow: "**",
  band: "&", bor: "|", bxor: "^", shl: "<<", shr: ">>", ushr: ">>>",
  eq: "===", ne: "!==", lt: "<", le: "<=", gt: ">", ge: ">=", and: "&&", or: "||",
});
const UNARY = /** @type {Partial<Record<Op, string>>} */ ({ neg: "-", pos: "+", not: "!", bnot: "~", truthy: "!!", present: "!!" });
const IDENT = /^[A-Za-z_$][\w$]*$/;

/**
 * Emits `k` as a JS function expression.
 *
 * Numbers are JS doubles, as the IR's `f64`. A store is a plain assignment: the DMG
 * host's entity and world proxies apply each attribute's coercion (and log its
 * warnings), so applying it here as well would coerce twice.
 * @param {Kernel} k
 * @returns {Emitted}
 */
export function emitKernel(k) {
  const lines = new LineTable(k.src);
  /** @type {string[]} */
  const text = [];
  /** @type {LineMap[]} */
  const map = [];
  /** @param {string} line @param {Span} span */
  const out = (line, span) => { text.push(line); map.push({ span, start: lines.at(span[0]) }); };
  const name = k.name.replace(/[^\w$]+/g, "_").replace(/^(\d)/, "_$1").replace(/_+$/, "");
  const params = k.params.map((p) => p.name);
  out(`function ${name}(${params.join(", ")}) {`, k.span);
  block(k.body, 1, out);
  out("}", k.span);
  return { name, params, source: text.join("\n"), lines: map };
}

/**
 * Turns emitted source into a callable function. Uses the Function constructor, so the page needs no build step.
 * @param {Emitted} e
 * @returns {(...args: any[]) => unknown}
 */
export function instantiate(e) {
  return new Function(`"use strict"; return (${e.source});`)();
}

/**
 * @param {Stmt[]} stmts
 * @param {number} depth
 * @param {(line: string, span: Span) => void} out
 */
function block(stmts, depth, out) {
  const pad = "  ".repeat(depth);
  for (const s of stmts) {
    switch (s.k) {
      case "let": out(`${pad}let ${s.name}${s.value ? ` = ${top(s.value)}` : ""};`, s.span); break;
      case "set": out(`${pad}${s.name} = ${top(s.value)};`, s.span); break;
      case "store": out(`${pad}${member(s.place.recv)}.${s.place.name} = ${top(s.value)};`, s.span); break;
      case "do": out(`${pad}${expr(s.value)};`, s.span); break;
      case "push": out(`${pad}${s.name}.push(${top(s.value)});`, s.span); break;
      case "return": out(`${pad}return${s.value ? ` ${top(s.value)}` : ""};`, s.span); break;
      case "break": case "continue": out(`${pad}${s.k};`, s.span); break;
      case "if":
        out(`${pad}if (${top(s.test)}) {`, s.span);
        block(s.then, depth + 1, out);
        if (s.else.length) { out(`${pad}} else {`, s.span); block(s.else, depth + 1, out); }
        out(`${pad}}`, s.span);
        break;
      case "for": {
        const update = s.update.map((u) => {
          if (u.k !== "set") throw new Error(`a for loop's update must be a local assignment, not ${u.k}`);
          return `${u.name} = ${top(u.value)}`;
        }).join(", ");
        out(`${pad}for (let ${s.name} = ${top(s.init)}; ${top(s.test)}; ${update}) {`, s.span);
        block(s.body, depth + 1, out);
        out(`${pad}}`, s.span);
        break;
      }
      case "each":
        out(`${pad}for (const ${s.name} of ${expr(s.list)}) {`, s.span);
        block(s.body, depth + 1, out);
        out(`${pad}}`, s.span);
        break;
    }
  }
}

/**
 * An expression standing alone in a statement: an operator or ternary, which `expr`
 * wraps whole in one pair of parentheses, drops that pair.
 * @param {Expr} e
 */
function top(e) {
  const s = expr(e);
  return e.k === "op" || e.k === "cond" ? s.slice(1, -1) : s;
}

/**
 * An expression as the receiver of `.name`: parenthesized unless it already binds tighter.
 * @param {Expr} e
 */
function member(e) {
  const s = expr(e);
  return e.k === "num" ? `(${s})` : s;
}

/**
 * Every compound expression comes out parenthesized, so precedence never needs reasoning about.
 * @param {Expr} e
 * @returns {string}
 */
function expr(e) {
  switch (e.k) {
    case "num": return Object.is(e.v, -0) ? "-0" : Number.isFinite(e.v) ? String(e.v) : e.v > 0 ? "Infinity" : e.v < 0 ? "-Infinity" : "NaN";
    case "str": return JSON.stringify(e.v);
    case "bool": return String(e.v);
    case "null": return "null";
    case "undef": return "void 0";
    case "local": case "global": return e.name;
    case "load": return `${member(e.place.recv)}.${e.place.name}`;
    case "field": return `${member(e.of)}.${e.name}`;
    case "list": return "[]";
    case "op": {
      const [a, b] = e.args.map(expr);
      const bin = BINARY[e.op];
      if (bin && e.args.length === 2) return `(${a} ${bin} ${b})`;
      const un = UNARY[e.op];
      if (un && e.args.length === 1) return `(${un}${a})`;
      throw new Error(`cannot emit op ${e.op}/${e.args.length}`);
    }
    case "cond": return `(${expr(e.test)} ? ${expr(e.then)} : ${expr(e.else)})`;
    case "call": {
      const args = e.args.map(expr).join(", ");
      const recv = e.recv ? member(e.recv) : "";
      const dot = e.fn.lastIndexOf(".");
      return dot < 0 ? `${recv || e.fn}(${args})` : `${recv}.${e.fn.slice(dot + 1)}(${args})`;
    }
    case "method": return `${member(e.recv)}.${e.name}(${e.args.map(expr).join(", ")})`;
    case "struct": return `({ ${Object.entries(e.fields).map(([k, v]) => `${IDENT.test(k) ? k : JSON.stringify(k)}: ${expr(v)}`).join(", ")} })`;
  }
}
