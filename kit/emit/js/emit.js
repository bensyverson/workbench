// The JavaScript backend: an IR kernel to the source of a plain function whose
// parameters are the lambda's own, so it drops into the slot the lambda filled.
// Every emitted line records the source span it came from.

import { LineTable } from "../../parse/lexer.js";
import { isVec, isF32Vec, isWide, COMPONENTS, round, vectorOp, intrinsicCall, collidingNames, id } from "./wide.js";

/** @import { Kernel, Stmt, Expr, Op, Span } from "../../ir/ir.js" */
/** @import { Position } from "../../parse/ast.js" */
/** @import { Cx, EmitOptions } from "./wide.js" */

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
 * @property {string[]} prelude Source the function needs defined before it (vector runtime, intrinsics' own code); empty for DMG lambdas.
 * @property {LineMap[]} lines  One entry per line of `source`.
 */

const BINARY = /** @type {Partial<Record<Op, string>>} */ ({
  add: "+", concat: "+", sub: "-", mul: "*", div: "/", rem: "%", pow: "**",
  band: "&", bor: "|", bxor: "^", shl: "<<", shr: ">>", ushr: ">>>",
  eq: "===", ne: "!==", lt: "<", le: "<=", gt: ">", ge: ">=", and: "&&", or: "||",
});
const UNARY = /** @type {Partial<Record<Op, string>>} */ ({ neg: "-", pos: "+", not: "!", bnot: "~", truthy: "!!" });
const IDENT = /^[A-Za-z_$][\w$]*$/;

/**
 * Emits `k` as a JS function expression.
 *
 * Numbers are JS doubles, as the IR's `f64`. A store is a plain assignment: the DMG
 * host's entity and world proxies apply each attribute's coercion (and log its
 * warnings), so applying it here as well would coerce twice. An f32 is a double that
 * `Math.fround` has rounded after every operation; a vector is an array (see README).
 * @param {Kernel} k
 * @param {EmitOptions} [options]
 * @returns {Emitted}
 */
export function emitKernel(k, options = {}) {
  /** @type {Cx} */
  const cx = { intrinsics: options.intrinsics ?? {}, prelude: new Set(), names: collidingNames(k, Object.keys(options.intrinsics ?? {})) };
  const lines = new LineTable(k.src);
  /** @type {string[]} */
  const text = [];
  /** @type {LineMap[]} */
  const map = [];
  /** @param {string} line @param {Span} span */
  const out = (line, span) => { text.push(line); map.push({ span, start: lines.at(span[0]) }); };
  const name = k.name.replace(/[^\w$]+/g, "_").replace(/^(\d)/, "_$1").replace(/_+$/, "");
  const params = k.params.map((p) => id(cx, p.name));
  out(`function ${name}(${params.join(", ")}) {`, k.span);
  // A caller may pass a double where a parameter is an f32: round it on the way in, as the interpreter does.
  for (const p of k.params) if (p.t === "f32" || isF32Vec(p.t)) out(`  ${id(cx, p.name)} = ${round(cx, p.t, id(cx, p.name))};`, k.span);
  block(k.body, 1, out, cx);
  out("}", k.span);
  return { name, params, source: text.join("\n"), prelude: [...cx.prelude], lines: map };
}

/**
 * Turns emitted source into a callable function. Uses the Function constructor, so the page needs no build step.
 * `scope` names what the function may reach besides its parameters: the program's helpers, and any globals.
 * @param {Emitted} e
 * @param {Record<string, unknown>} [scope]
 * @returns {(...args: any[]) => unknown}
 */
export function instantiate(e, scope = {}) {
  return new Function(...Object.keys(scope), `"use strict";\n${e.prelude.map((p) => `${p}\n`).join("")}return (${e.source});`)(...Object.values(scope));
}

/**
 * Makes a program's helpers callable, each by its name, and able to call one another.
 * @param {Emitted[]} helpers  Emitted helper kernels; a helper's name is its kernel's name.
 * @returns {Record<string, (...args: any[]) => unknown>}
 */
export function emitHelpers(helpers) {
  const names = helpers.map((h) => h.name);
  const prelude = [...new Set(helpers.flatMap((h) => h.prelude))];
  const body = `"use strict";\n${prelude.map((p) => `${p}\n`).join("")}${helpers.map((h) => `const ${h.name} = (${h.source});`).join("\n")}\nreturn { ${names.join(", ")} };`;
  return new Function(body)();
}

/**
 * @param {Stmt[]} stmts
 * @param {number} depth
 * @param {(line: string, span: Span) => void} out
 * @param {Cx} cx
 */
function block(stmts, depth, out, cx) {
  const pad = "  ".repeat(depth);
  for (const s of stmts) {
    switch (s.k) {
      case "let": out(`${pad}let ${id(cx, s.name)}${s.value ? ` = ${top(s.value, cx)}` : ""};`, s.span); break;
      case "set": out(`${pad}${id(cx, s.name)} = ${top(s.value, cx)};`, s.span); break;
      case "store": out(`${pad}${member(s.place.recv, cx)}.${s.place.name} = ${top(s.value, cx)};`, s.span); break;
      case "bump": out(`${pad}${member(s.place.recv, cx)}.${s.place.name} += ${top(s.value, cx)};`, s.span); break;
      case "do": out(`${pad}${expr(s.value, cx)};`, s.span); break;
      case "push": out(`${pad}${id(cx, s.name)}.push(${top(s.value, cx)});`, s.span); break;
      case "return": out(`${pad}return${s.value ? ` ${top(s.value, cx)}` : ""};`, s.span); break;
      case "break": case "continue": out(`${pad}${s.k};`, s.span); break;
      case "if":
        out(`${pad}if (${top(s.test, cx)}) {`, s.span);
        block(s.then, depth + 1, out, cx);
        if (s.else.length) { out(`${pad}} else {`, s.span); block(s.else, depth + 1, out, cx); }
        out(`${pad}}`, s.span);
        break;
      case "for": {
        const update = s.update.map((u) => {
          if (u.k !== "set") throw new Error(`a for loop's update must be a local assignment, not ${u.k}`);
          return `${id(cx, u.name)} = ${top(u.value, cx)}`;
        }).join(", ");
        out(`${pad}for (let ${id(cx, s.name)} = ${top(s.init, cx)}; ${top(s.test, cx)}; ${update}) {`, s.span);
        block(s.body, depth + 1, out, cx);
        out(`${pad}}`, s.span);
        break;
      }
      case "each":
        out(`${pad}for (const ${id(cx, s.name)} of ${expr(s.list, cx)}) {`, s.span);
        block(s.body, depth + 1, out, cx);
        out(`${pad}}`, s.span);
        break;
    }
  }
}

/**
 * An expression standing alone in a statement: an operator or ternary, which `expr`
 * wraps whole in one pair of parentheses, drops that pair.
 * @param {Expr} e
 * @param {Cx} cx
 */
function top(e, cx) {
  const s = expr(e, cx);
  return wrapped(e, s) ? s.slice(1, -1) : s;
}

/**
 * Whether `s`, the source of `e`, is one operator or ternary in a single pair of parentheses.
 * An f32 operator is `Math.fround(...)` instead, and a vector one a runtime call.
 * @param {Expr} e
 * @param {string} s
 */
const wrapped = (e, s) => (e.k === "op" || e.k === "cond") && s.startsWith("(");

/**
 * An expression as the receiver of `.name`: parenthesized unless it already binds tighter.
 * @param {Expr} e
 * @param {Cx} cx
 */
function member(e, cx) {
  const s = expr(e, cx);
  return e.k === "num" ? `(${s})` : s;
}

/**
 * The nodes whose value may be a double where the IR says f32: an operation's result, anything read
 * from outside the kernel, anything a call hands back. A literal, a local or a vector's own
 * component is already rounded. (The reference interpreter rounds every node; rounding twice changes nothing.)
 * @param {Expr} e
 */
const mayNeedRounding = (e) => {
  switch (e.k) {
    case "op": return e.op !== "f32";
    case "global": case "load": case "call": case "helper": case "method": case "index": return true;
    case "field": return !isVec(e.of.t);
    default: return false;
  }
};

/**
 * Every compound expression is parenthesized, so precedence never needs reasoning about. An f32 (or
 * a vector of them) that an operation or a read may have left unrounded is rounded here.
 * @param {Expr} e
 * @param {Cx} cx
 * @returns {string}
 */
function expr(e, cx) {
  const s = raw(e, cx);
  if (!mayNeedRounding(e) || !(e.t === "f32" || isF32Vec(e.t))) return s;
  return round(cx, e.t, wrapped(e, s) ? s.slice(1, -1) : s);
}

/**
 * @param {Expr} e
 * @param {Cx} cx
 * @returns {string}
 */
function raw(e, cx) {
  /** @param {Expr} x */
  const sub = (x) => expr(x, cx);
  switch (e.k) {
    case "num": return Object.is(e.v, -0) ? "-0" : Number.isFinite(e.v) ? String(e.v) : e.v > 0 ? "Infinity" : e.v < 0 ? "-Infinity" : "NaN";
    case "str": return JSON.stringify(e.v);
    case "bool": return String(e.v);
    case "null": return "null";
    case "undef": return "void 0";
    case "local": return id(cx, e.name);
    case "global": return e.name;
    case "load": return `${member(e.place.recv, cx)}.${e.place.name}`;
    case "field": return isVec(e.of.t) ? `${member(e.of, cx)}[${COMPONENTS.indexOf(e.name)}]` : `${member(e.of, cx)}.${e.name}`;
    case "index": return `${member(e.of, cx)}[${top(e.index, cx)}]`;
    case "array": return `[${e.items.map(sub).join(", ")}]`;
    case "list": return "[]";
    case "op": return opSource(e, cx);
    case "cond": return `(${sub(e.test)} ? ${sub(e.then)} : ${sub(e.else)})`;
    case "call": {
      const spelling = cx.intrinsics[e.fn];
      if (spelling) return intrinsicCall(cx, e.fn, spelling, e.args.map((a) => ({ src: sub(a), t: a.t, simple: a.k === "local" || a.k === "num" })));
      const args = e.args.map(sub).join(", ");
      const recv = e.recv ? member(e.recv, cx) : "";
      const dot = e.fn.lastIndexOf(".");
      return dot < 0 ? `${recv || e.fn}(${args})` : `${recv}.${e.fn.slice(dot + 1)}(${args})`;
    }
    case "helper": return `${e.name}(${e.args.map(sub).join(", ")})`;
    case "method": return `${member(e.recv, cx)}.${e.name}(${e.args.map(sub).join(", ")})`;
    case "struct": return `({ ${Object.entries(e.fields).map(([k, v]) => `${IDENT.test(k) ? k : JSON.stringify(k)}: ${sub(v)}`).join(", ")} })`;
    case "vec": return `[${e.items.map(sub).join(", ")}]`;
  }
}

/**
 * An operator. One on an f32 is JavaScript's operator on the doubles (the caller rounds the
 * result); one on a vector is the runtime's; `f32` and `f64` convert. Everything else is as it
 * was in M1, so DMG output does not change.
 * @param {Extract<Expr, { k: "op" }>} e
 * @param {Cx} cx
 * @returns {string}
 */
function opSource(e, cx) {
  const args = e.args.map((x) => expr(x, cx));
  const [a, b] = args;
  if (e.op === "f32") return round(cx, "f32", top(e.args[0], cx));
  if (e.op === "f64") return a;
  if ([e.t, ...e.args.map((x) => x.t)].some(isWide)) {
    if (e.args.some((x) => isVec(x.t))) {
      const v = vectorOp(cx, e.op, args);
      if (v) return v;
      throw new Error(`cannot emit op ${e.op} on a vector`);
    }
    // Math.pow, because `**` on a constant may be folded by an engine differently from the call the interpreter makes.
    if (e.op === "pow" && args.length === 2) return `Math.pow(${a}, ${b})`;
  }
  const bin = BINARY[e.op];
  // `-2 ** 2` is a SyntaxError: a negative literal on the left of `**` needs its own parentheses.
  if (e.op === "pow" && bin && e.args.length === 2) return `(${a.startsWith("-") ? `(${a})` : a} ${bin} ${b})`;
  if (bin && e.args.length === 2) return `(${a} ${bin} ${b})`;
  // Loose, so a host's missing value (undefined) is empty as null is, and 0 is present.
  if (e.op === "present" && args.length === 1) return `(${a} != null)`;
  const un = UNARY[e.op];
  if (un && e.args.length === 1) return `(${un}${a})`;
  throw new Error(`cannot emit op ${e.op}/${e.args.length}`);
}
