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
 * @property {{ raw: string, cooked: string, tail: boolean, rawStart: number, rawEnd: number }} [template] For template chunks; `rawStart`..`rawEnd` is the text between the delimiters.
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
const ID_START = /^[\p{ID_Start}$_]$/u;
const ID_PART = /^[\p{ID_Continue}$‌‍]$/u;
const WHITESPACE = /^[\t\v\f  ﻿\p{Zs}]$/u;
/** ECMAScript line terminators. @param {string | undefined} c */
const isLineTerminator = (c) => c === "\n" || c === "\r" || c === " " || c === " ";
/** @param {string | undefined} c */
const isDigit = (c) => c !== undefined && c >= "0" && c <= "9";

/** Maps offsets to positions; a line break is \n, \r\n, a lone \r, U+2028 or U+2029. */
export class LineTable {
  /** @param {string} src */
  constructor(src) {
    /** Offset where each line starts. @type {number[]} */
    this.starts = [0];
    for (let i = 0; i < src.length; i++) {
      if (src[i] === "\r" && src[i + 1] === "\n") i++;
      if (isLineTerminator(src[i])) this.starts.push(i + 1);
    }
  }

  /** @param {number} offset @returns {Position} */
  at(offset) {
    let lo = 0, hi = this.starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.starts[mid] <= offset) lo = mid; else hi = mid - 1;
    }
    return { line: lo + 1, column: offset - this.starts[lo] };
  }
}

export class Lexer {
  /** @param {string} src */
  constructor(src) {
    this.src = src;
    this.pos = 0;
    this.lines = new LineTable(src);
  }

  /** @returns {number} */
  save() { return this.pos; }
  /** @param {number} pos */
  restore(pos) { this.pos = pos; }

  /** @returns {Position} */
  here() { return this.lines.at(this.pos); }

  /** The code point at `pos`, as a string; "" at the end. @param {number} pos */
  charAt(pos) {
    const cp = this.src.codePointAt(pos);
    return cp === undefined ? "" : String.fromCodePoint(cp);
  }

  /** Skips whitespace and comments; returns whether a line break was crossed. */
  skipTrivia() {
    let nl = false;
    const s = this.src;
    while (this.pos < s.length) {
      const c = s[this.pos];
      if (isLineTerminator(c)) { nl = true; this.pos++; }
      else if (WHITESPACE.test(c)) this.pos++;
      else if (c === "/" && s[this.pos + 1] === "/") { while (this.pos < s.length && !isLineTerminator(s[this.pos])) this.pos++; }
      else if (c === "/" && s[this.pos + 1] === "*") {
        const start = this.pos;
        const close = s.indexOf("*/", this.pos + 2);
        if (close < 0) throw new SyntaxFailure("P002", "This block comment is never closed.", "Close the comment with */.", start, s.length);
        for (let i = this.pos; i < close; i++) if (isLineTerminator(s[i])) nl = true;
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
    const c = this.charAt(this.pos);

    if (ID_START.test(c)) {
      this.pos += c.length;
      while (this.pos < s.length && ID_PART.test(this.charAt(this.pos))) this.pos += this.charAt(this.pos).length;
      return tok("name", s.slice(start, this.pos));
    }
    if (isDigit(c) || (c === "." && isDigit(s[this.pos + 1]))) return this.readNumber(tok);
    if (c === '"' || c === "'") return this.readString(tok, c);
    if (c === "`") { this.pos++; return this.readTemplateChunk(tok); }
    if (s.startsWith("<!--", start) || (nlBefore && s.startsWith("-->", start))) {
      throw new SyntaxFailure("P001", "HTML-like comments are not supported.", "Use // for a comment.", start, start + (s[start] === "<" ? 4 : 3));
    }
    for (const p of PUNCTUATORS) if (s.startsWith(p, this.pos)) {
      // `?.` followed by a digit is a ternary and a number: `a?.5:1`.
      if (p === "?." && isDigit(s[this.pos + 2])) continue;
      this.pos += p.length;
      return tok("punct", p);
    }
    throw new SyntaxFailure("P001", `Unexpected character ${JSON.stringify(c)}.`, "Remove it, or check for a stray symbol from another language.", start, start + c.length);
  }

  /**
   * Reads digits matching `digit` with numeric separators, which need a digit on both sides.
   * @param {RegExp} digit
   */
  readDigits(digit) {
    const s = this.src, start = this.pos;
    while (this.pos < s.length) {
      const c = s[this.pos];
      if (digit.test(c)) this.pos++;
      else if (c === "_") {
        if (!(this.pos > start && digit.test(s[this.pos - 1])) || !digit.test(s[this.pos + 1] ?? "")) {
          throw new SyntaxFailure("P001", "A numeric separator (_) must sit between two digits.", "Remove the underscore, or put a digit on each side of it.", this.pos, this.pos + 1);
        }
        this.pos++;
      } else break;
    }
    return s.slice(start, this.pos);
  }

  /** @param {(type: TokType, value: string, extra?: Partial<Token>) => Token} tok */
  readNumber(tok) {
    const s = this.src, start = this.pos;
    /** @param {string} message @param {string} tip */
    const bad = (message, tip) => new SyntaxFailure("P001", message, tip, start, Math.max(this.pos, start + 1));
    const prefix = s.slice(this.pos, this.pos + 2).toLowerCase();
    if (prefix === "0x" || prefix === "0b" || prefix === "0o") {
      this.pos += 2;
      const digit = prefix === "0x" ? /[0-9a-fA-F]/ : prefix === "0b" ? /[01]/ : /[0-7]/;
      if (this.readDigits(digit) === "") throw bad(`The ${prefix} prefix needs digits after it.`, "Write the digits, or drop the prefix.");
    } else {
      if (s[this.pos] === "0" && (isDigit(s[this.pos + 1]) || s[this.pos + 1] === "_")) {
        throw bad("Legacy octal numbers and leading zeros (like 010) are not supported.", "Write 0o10 for octal, or drop the leading zero.");
      }
      this.readDigits(/[0-9]/);
      if (s[this.pos] === ".") {
        this.pos++;
        this.readDigits(/[0-9]/);
      }
      if (s[this.pos] === "e" || s[this.pos] === "E") {
        this.pos++;
        if (s[this.pos] === "+" || s[this.pos] === "-") this.pos++;
        if (this.readDigits(/[0-9]/) === "") throw bad("This exponent has no digits.", "Write the exponent, like 1e3, or remove the e.");
      }
    }
    if (s[this.pos] === "n") throw new SyntaxFailure("P004", "BigInt literals are not supported.", "Use an ordinary number.", start, this.pos + 1);
    const after = this.charAt(this.pos);
    if (after !== "" && (ID_START.test(after) || ID_PART.test(after))) {
      throw new SyntaxFailure("P001", `A number cannot be followed directly by ${JSON.stringify(after)}.`, "Put a space or an operator between the number and the name.", start, this.pos + after.length);
    }
    const text = s.slice(start, this.pos);
    return tok("num", text, { literal: Number(text.replace(/_/g, "")) });
  }

  /** @param {(type: TokType, value: string, extra?: Partial<Token>) => Token} tok @param {string} quote */
  readString(tok, quote) {
    const s = this.src, start = this.pos;
    this.pos++;
    let out = "";
    while (true) {
      if (this.pos >= s.length || s[this.pos] === "\n" || s[this.pos] === "\r") throw new SyntaxFailure("P002", "This string is never closed.", `End the string with ${quote} on the same line.`, start, this.pos);
      const c = s[this.pos];
      if (c === quote) { this.pos++; break; }
      if (c === "\\") { out += this.readEscape(); continue; }
      out += c; this.pos++;
    }
    return tok("string", s.slice(start, this.pos), { literal: out });
  }

  /** Reads one escape sequence starting at a backslash; returns its value. */
  readEscape() {
    const s = this.src, start = this.pos;
    const c = this.charAt(this.pos + 1);
    this.pos += 1 + c.length;
    /** @param {string} message @param {string} tip */
    const bad = (message, tip) => new SyntaxFailure("P001", message, tip, start, Math.min(Math.max(this.pos, start + 2), s.length));
    /** @type {Record<string, string>} */
    const simple = { n: "\n", t: "\t", r: "\r", b: "\b", f: "\f", v: "\v" };
    if (c === "") throw new SyntaxFailure("P002", "This escape sequence is never finished.", "Finish the escape, or remove the backslash.", start, s.length);
    if (Object.hasOwn(simple, c)) return simple[c];
    if (c === "\r") { if (s[this.pos] === "\n") this.pos++; return ""; }
    if (c === "\n" || c === " " || c === " ") return "";
    if (c === "0" && !isDigit(s[this.pos])) return "\0";
    if (isDigit(c)) throw bad("Octal-style escapes (like \\1 or \\01) are not supported.", "Use \\x01 for a control character, or \\0 for NUL.");
    if (c === "x") {
      const h = /^[0-9a-fA-F]{2}/.exec(s.slice(this.pos, this.pos + 2));
      if (!h) throw bad("\\x needs two hex digits.", "Write the escape as \\xHH.");
      this.pos += 2;
      return String.fromCharCode(parseInt(h[0], 16));
    }
    if (c === "u") {
      const braced = /^\{([0-9a-fA-F]+)\}/.exec(s.slice(this.pos, this.pos + 10));
      if (braced) {
        const cp = parseInt(braced[1], 16);
        this.pos += braced[0].length;
        if (cp > 0x10ffff) throw bad("This Unicode escape is above U+10FFFF.", "Use a code point of at most 10FFFF.");
        return String.fromCodePoint(cp);
      }
      const h = /^[0-9a-fA-F]{4}/.exec(s.slice(this.pos, this.pos + 4));
      if (!h) throw bad("\\u needs four hex digits or {…}.", "Write the escape as \\uHHHH or \\u{H…}.");
      this.pos += 4;
      return String.fromCharCode(parseInt(h[0], 16));
    }
    return c;
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
      if (c === "`" || (c === "$" && s[this.pos + 1] === "{")) {
        const tail = c === "`";
        const rawEnd = this.pos;
        // JavaScript normalizes line breaks in a template's raw and cooked text alike.
        const raw = s.slice(textStart, rawEnd).replace(/\r\n?/g, "\n");
        this.pos += tail ? 1 : 2;
        return tok("template", raw, { template: { raw, cooked, tail, rawStart: textStart, rawEnd } });
      }
      if (c === "\\") { cooked += this.readEscape(); continue; }
      if (c === "\r") { cooked += "\n"; this.pos += s[this.pos + 1] === "\n" ? 2 : 1; continue; }
      cooked += c; this.pos++;
    }
  }

  /** Continues a template after the `}` of a substitution; `closeBrace` is that token. @param {Token} closeBrace @returns {Token} */
  continueTemplate(closeBrace) {
    this.restore(closeBrace.end);
    const start = closeBrace.start, loc = closeBrace.loc;
    return this.readTemplateChunk((type, value, extra = {}) => ({ type, value, start, end: this.pos, loc, endLoc: this.here(), nlBefore: false, ...extra }));
  }
}
