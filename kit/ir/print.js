// A text listing of a kernel, for people and agents: one statement per line, the
// statement's effects as a trailing comment. The JSON form stays the source of truth.

import { showType, vectorOf } from "./types.js";

/** @import { Kernel, Stmt, Expr, Coerce, Effect } from "./ir.js" */

/** The column trailing comments start at. */
const COMMENT_COLUMN = 43;

/**
 * @param {Kernel} k
 * @returns {string}
 */
export function printKernel(k) {
  const params = k.params.map((p) => `${p.name}: ${showType(p.t)}`).join(", ");
  /** @type {string[]} */
  const lines = [];
  lines.push(withComment(`kernel ${k.name}(${params}) -> ${showType(k.returns)}`, [k.space]));
  lines.push(`  ; effects: ${k.effects.join(", ") || "none"}`);
  if (k.needs.length) lines.push(`  ; needs: ${k.needs.map((n) => `${n.need} (${n.span[0]}..${n.span[1]}${n.via ? `, via ${n.via}` : ""})`).join(", ")}`);
  block(k.body, 1, lines);
  return lines.join("\n") + "\n";
}

/**
 * @param {string} code
 * @param {readonly string[]} notes
 */
function withComment(code, notes) {
  if (!notes.length) return code;
  return `${code.padEnd(COMMENT_COLUMN - 1)} ; ${notes.join(", ")}`;
}

/**
 * @param {Stmt[]} stmts
 * @param {number} depth
 * @param {string[]} out
 */
function block(stmts, depth, out) {
  for (const s of stmts) stmt(s, depth, out);
}

/**
 * @param {Stmt} s
 * @param {number} depth
 * @param {string[]} out
 */
function stmt(s, depth, out) {
  const pad = "  ".repeat(depth);
  /** @param {string} code */
  const line = (code) => out.push(withComment(pad + code, /** @type {Effect[]} */ (s.effects)));
  switch (s.k) {
    case "let": return line(`let ${s.name}: ${showType(s.t)}${s.value ? ` = ${expr(s.value)}` : ""}`);
    case "set": return line(`${s.name} = ${expr(s.value)}`);
    case "store": return line(`store.${coerce(s.place.store)} ${expr(s.place.recv)}.${s.place.name}, ${expr(s.value)}`);
    case "bump": return line(`bump ${expr(s.place.recv)}.${s.place.name}, ${expr(s.value)}`);
    case "do": return line(expr(s.value));
    case "push": return line(`push ${s.name}, ${expr(s.value)}`);
    case "return": return line(s.value ? `return ${expr(s.value)}` : "return");
    case "break": case "continue": return line(s.k);
    case "if":
      line(`if ${expr(s.test)} {`);
      block(s.then, depth + 1, out);
      if (s.else.length) { out.push(`${pad}} else {`); block(s.else, depth + 1, out); }
      out.push(`${pad}}`);
      return;
    case "for": {
      const update = s.update.map((u) => (u.k === "set" ? `${u.name} = ${expr(u.value)}` : u.k)).join(", ");
      line(`for ${s.name} = ${expr(s.init)}; ${expr(s.test)}; ${update} {    ; bound ${s.bound}`);
      block(s.body, depth + 1, out);
      out.push(`${pad}}`);
      return;
    }
    case "each":
      line(`each ${s.name} in ${expr(s.list)} (≤ ${s.max}) {`);
      block(s.body, depth + 1, out);
      out.push(`${pad}}`);
      return;
  }
}

/**
 * `u16`, or `u16[0..9999]` when the place has bounds.
 * @param {Coerce | undefined} c
 */
function coerce(c) {
  if (!c) return "?";
  if (c.min == null && c.max == null) return c.type;
  return `${c.type}[${c.min ?? ""}..${c.max ?? ""}]`;
}

/**
 * @param {Expr} e
 * @returns {string}
 */
export function expr(e) {
  switch (e.k) {
    case "num": return e.t === "f32" ? f32Text(e.v) : String(e.v);
    case "str": return JSON.stringify(e.v);
    case "bool": return String(e.v);
    case "null": return "null";
    case "undef": return "undefined";
    case "local": case "global": return e.name;
    case "load": return `${expr(e.place.recv)}.${e.place.name}`;
    case "op": return `${e.op}${opSuffix(e)}(${e.args.map(expr).join(", ")})`;
    case "cond": return `(${expr(e.test)} ? ${expr(e.then)} : ${expr(e.else)})`;
    case "call": {
      const args = e.args.map(expr).join(", ");
      if (!e.recv) return `${e.fn}(${args})`;
      const dot = e.fn.lastIndexOf(".");
      return dot < 0 ? `${expr(e.recv)}(${args})` : `${expr(e.recv)}.${e.fn.slice(dot + 1)}(${args})`;
    }
    case "helper": return `${e.name}(${e.args.map(expr).join(", ")})`;
    case "method": return `${expr(e.recv)}.${e.name}(${e.args.map(expr).join(", ")})`;
    case "struct": return `{ ${Object.entries(e.fields).map(([k, v]) => `${k}: ${expr(v)}`).join(", ")} }`;
    case "field": return `${expr(e.of)}.${e.name}`;
    case "index": return `${expr(e.of)}[${expr(e.index)}]`;
    case "array": return `[${e.items.map(expr).join(", ")}]`;
    case "concat": return `[${e.parts.map((p) => `...${expr(p)}`).join(", ")}]`;
    case "list": return "[]";
    case "vec": return `${showType(e.t)}(${e.items.map(expr).join(", ")})`;
  }
}

/**
 * The shortest decimal that reads back, rounded to f32, as `v`, an f32 value: `0.1` for
 * `Math.fround(0.1)`, where `String` would give 0.10000000149011612.
 * @param {number} v
 * @returns {string}
 */
export function f32Text(v) {
  for (let digits = 1; digits < 9; digits++) {
    const text = String(Number(v.toPrecision(digits)));
    if (Math.fround(Number(text)) === v) return text;
  }
  return String(Number(v.toPrecision(9)));
}

/**
 * The type an operator's listing names, `add.vec2(…)`, when it works on f32s or vectors:
 * its result's, or for a compare its first operand's. Ops on f64 and the conversions,
 * whose names say their type, are listed bare, as in M1.
 * @param {Extract<Expr, { k: "op" }>} e
 * @returns {string}
 */
function opSuffix(e) {
  if (e.op === "f32" || e.op === "f64") return "";
  const t = e.t === "bool" && e.args.length ? e.args[0].t : e.t;
  return t === "f32" || vectorOf(t) ? `.${showType(t)}` : "";
}
