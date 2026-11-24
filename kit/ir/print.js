// A text listing of a kernel, for people and agents: one statement per line, the
// statement's effects as a trailing comment. The JSON form stays the source of truth.

import { showType } from "./types.js";

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
    case "num": return String(e.v);
    case "str": return JSON.stringify(e.v);
    case "bool": return String(e.v);
    case "null": return "null";
    case "undef": return "undefined";
    case "local": case "global": return e.name;
    case "load": return `${expr(e.place.recv)}.${e.place.name}`;
    case "op": return `${e.op}(${e.args.map(expr).join(", ")})`;
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
    case "list": return "[]";
  }
}
