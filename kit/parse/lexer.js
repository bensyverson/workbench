// A pull-based lexer for the source of one lambda. The parser asks for one token
// at a time, which lets it resume a template literal after each `${…}` and
// decide what `/` means from context.

/** @import { Position } from "./ast.js" */

/**
 * @typedef {"name" | "num" | "string" | "template" | "punct" | "eof"} TokType
 * @typedef {object} Token
 * @property {TokType} type
 * @property {string} value     Name, punctuator, or raw text of a number or string.
 * @property {number | string | undefined} [literal] Decoded value of a number or string.
 * @property {{ raw: string, cooked: string, tail: boolean }} [template] For template chunks.
 * @property {number} start
 * @property {number} end
 * @property {Position} loc     Start position.
 * @property {Position} endLoc
 * @property {boolean} nlBefore A line break separates this token from the previous one.
 */

/** Thrown for input the lexer or parser cannot read; carries a code, a tip and a span. */
export class SyntaxFailure extends Error {
  /** @param {string} code @param {string} message @param {string} tip @param {number} start @param {number} end */
  constructor(code, message, tip, start, end) {
    super(message);
    this.code = code; this.tip = tip; this.start = start; this.end = end;
  }
}

// Longest first, so `>>>=` wins over `>>`.
const PUNCTUATORS = [
  ">>>=", "...", "===", "!==", "**=", "<<=", ">>=", ">>>", "&&=", "||=", "??=",
  "=>", "==", "!=", "<=", ">=", "&&", "||", "??", "?.", "++", "--", "+=", "-=", "*=", "/=", "%=", "&=", "|=", "^=", "<<", ">>", "**",
  "{", "}", "(", ")", "[", "]", ";", ",", "<", ">", "+", "-", "*", "/", "%", "&", "|", "^", "!", "~", "?", ":", "=", ".", "@", "#",
];
const ID_START = /[A-Za-z_$À-￿]/;
const ID_PART = /[A-Za-z0-9_$À-￿]/;

export class Lexer {
  /** @param {string} src */
  constructor(src) {
    this.src = src;
    this.pos = 0;
    this.line = 1;
    this.lineStart = 0;
  }

  /** @returns {{ pos: number, line: number, lineStart: number }} */
  save() { return { pos: this.pos, line: this.line, lineStart: this.lineStart }; }
  /** @param {{ pos: number, line: number, lineStart: number }} s */
  restore(s) { this.pos = s.pos; this.line = s.line; this.lineStart = s.lineStart; }

  /** @returns {Position} */
  here() { return { line: this.line, column: this.pos - this.lineStart }; }

  /** Converts an offset to a position, scanning from the start. @param {number} offset @returns {Position} */
  positionAt(offset) {
    let line = 1, start = 0;
    for (let i = 0; i < offset && i < this.src.length; i++) if (this.src[i] === "\n") { line++; start = i + 1; }
    return { line, column: offset - start };
  }

  /** Skips whitespace and comments; returns whether a line break was crossed. */
  skipTrivia() {
    let nl = false;
    const s = this.src;
    while (this.pos < s.length) {
      const c = s[this.pos];
      if (c === "\n") { nl = true; this.pos++; this.line++; this.lineStart = this.pos; }
      else if (c === " " || c === "\t" || c === "\r" || c === "\f" || c === "\v" || c === " " || c === "﻿") this.pos++;
      else if (c === "/" && s[this.pos + 1] === "/") { while (this.pos < s.length && s[this.pos] !== "\n") this.pos++; }
      else if (c === "/" && s[this.pos + 1] === "*") {
        const start = this.pos;
        const close = s.indexOf("*/", this.pos + 2);
        if (close < 0) throw new SyntaxFailure("P002", "This block comment is never closed.", "Close the comment with */.", start, s.length);
        for (let i = this.pos; i < close; i++) if (s[i] === "\n") { nl = true; this.line++; this.lineStart = i + 1; }
        this.pos = close + 2;
      } else break;
    }
    return nl;
  }

  /** Reads the next token. @returns {Token} */
  next() {
    const nlBefore = this.skipTrivia();
    const s = this.src, start = this.pos, loc = this.here();
    /** @param {TokType} type @param {string} value @param {Partial<Token>} [extra] @returns {Token} */
    const tok = (type, value, extra = {}) => ({ type, value, start, end: this.pos, loc, endLoc: this.here(), nlBefore, ...extra });
    if (this.pos >= s.length) return tok("eof", "");
    const c = s[this.pos];

    if (ID_START.test(c)) {
      while (this.pos < s.length && ID_PART.test(s[this.pos])) this.pos++;
      return tok("name", s.slice(start, this.pos));
    }
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(s[this.pos + 1] ?? ""))) return this.readNumber(tok);
    if (c === '"' || c === "'") return this.readString(tok, c);
    if (c === "`") { this.pos++; return this.readTemplateChunk(tok); }
    for (const p of PUNCTUATORS) if (s.startsWith(p, this.pos)) {
      // `?.` followed by a digit is a ternary and a number: `a?.5:1`.
      if (p === "?." && /[0-9]/.test(s[this.pos + 2] ?? "")) continue;
      this.pos += p.length;
      return tok("punct", p);
    }
    throw new SyntaxFailure("P001", `Unexpected character ${JSON.stringify(c)}.`, "Remove it, or check for a stray symbol from another language.", start, start + 1);
  }

  /** @param {(type: TokType, value: string, extra?: Partial<Token>) => Token} tok */
  readNumber(tok) {
    const s = this.src, start = this.pos;
    const prefix = s.slice(this.pos, this.pos + 2).toLowerCase();
    let digits;
    if (prefix === "0x" || prefix === "0b" || prefix === "0o") {
      this.pos += 2;
      const re = prefix === "0x" ? /[0-9a-fA-F_]/ : prefix === "0b" ? /[01_]/ : /[0-7_]/;
      while (this.pos < s.length && re.test(s[this.pos])) this.pos++;
      digits = s.slice(start, this.pos).replace(/_/g, "");
    } else {
      while (this.pos < s.length && /[0-9_]/.test(s[this.pos])) this.pos++;
      if (s[this.pos] === ".") { this.pos++; while (this.pos < s.length && /[0-9_]/.test(s[this.pos])) this.pos++; }
      if (/[eE]/.test(s[this.pos] ?? "")) {
        this.pos++;
        if (/[+-]/.test(s[this.pos] ?? "")) this.pos++;
        while (this.pos < s.length && /[0-9]/.test(s[this.pos])) this.pos++;
      }
      digits = s.slice(start, this.pos).replace(/_/g, "");
    }
    if (s[this.pos] === "n") throw new SyntaxFailure("P004", "BigInt literals are not supported.", "Use an ordinary number.", start, this.pos + 1);
    if (ID_START.test(s[this.pos] ?? "")) throw new SyntaxFailure("P001", `A number cannot be followed directly by ${JSON.stringify(s[this.pos])}.`, "Put a space or an operator between the number and the name.", start, this.pos + 1);
    return tok("num", s.slice(start, this.pos), { literal: Number(digits) });
  }

  /** @param {(type: TokType, value: string, extra?: Partial<Token>) => Token} tok @param {string} quote */
  readString(tok, quote) {
    const s = this.src, start = this.pos;
    this.pos++;
    let out = "";
    while (true) {
      if (this.pos >= s.length || s[this.pos] === "\n") throw new SyntaxFailure("P002", "This string is never closed.", `End the string with ${quote} on the same line.`, start, this.pos);
      const c = s[this.pos];
      if (c === quote) { this.pos++; break; }
      if (c === "\\") { out += this.readEscape(); continue; }
      out += c; this.pos++;
    }
    return tok("string", s.slice(start, this.pos), { literal: out });
  }

  /** Reads one escape sequence starting at a backslash; returns its value. */
  readEscape() {
    const s = this.src;
    const c = s[this.pos + 1];
    this.pos += 2;
    /** @type {Record<string, string>} */
    const simple = { n: "\n", t: "\t", r: "\r", b: "\b", f: "\f", v: "\v", 0: "\0" };
    if (c in simple) return simple[c];
    if (c === "x") { const h = s.slice(this.pos, this.pos + 2); this.pos += 2; return String.fromCharCode(parseInt(h, 16)); }
    if (c === "u") {
      if (s[this.pos] === "{") { const close = s.indexOf("}", this.pos); const h = s.slice(this.pos + 1, close); this.pos = close + 1; return String.fromCodePoint(parseInt(h, 16)); }
      const h = s.slice(this.pos, this.pos + 4); this.pos += 4; return String.fromCharCode(parseInt(h, 16));
    }
    if (c === "\n") { this.line++; this.lineStart = this.pos; return ""; }
    return c ?? "";
  }

  /**
   * Reads template text up to `${` or the closing backtick. Call after the opening
   * backtick, or after the `}` that closes a substitution.
   * @param {(type: TokType, value: string, extra?: Partial<Token>) => Token} tok
   */
  readTemplateChunk(tok) {
    const s = this.src, textStart = this.pos;
    let cooked = "";
    while (true) {
      if (this.pos >= s.length) throw new SyntaxFailure("P002", "This template literal is never closed.", "End the template with a backtick (`).", textStart - 1, s.length);
      const c = s[this.pos];
      if (c === "`") {
        const raw = s.slice(textStart, this.pos);
        this.pos++;
        return tok("template", raw, { template: { raw, cooked, tail: true } });
      }
      if (c === "$" && s[this.pos + 1] === "{") {
        const raw = s.slice(textStart, this.pos);
        this.pos += 2;
        return tok("template", raw, { template: { raw, cooked, tail: false } });
      }
      if (c === "\\") { cooked += this.readEscape(); continue; }
      if (c === "\n") { this.line++; this.lineStart = this.pos + 1; }
      cooked += c; this.pos++;
    }
  }

  /** Continues a template after the `}` of a substitution; `closeBrace` is that token. @param {Token} closeBrace @returns {Token} */
  continueTemplate(closeBrace) {
    this.restore({ pos: closeBrace.end, line: closeBrace.endLoc.line, lineStart: closeBrace.end - closeBrace.endLoc.column });
    const start = closeBrace.start, loc = closeBrace.loc;
    return this.readTemplateChunk((type, value, extra = {}) => ({ type, value, start, end: this.pos, loc, endLoc: this.here(), nlBefore: false, ...extra }));
  }
}
