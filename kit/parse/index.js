// The subset parser: parse one runtime lambda from its source text, check it
// against the runtime subset, and apply the fixits diagnostics offer.

import { Parser } from "./parser.js";
import { SyntaxFailure } from "./lexer.js";
import { checkSubset, SUBSET_RULES } from "./subset.js";

/** @import { Diagnostic, Edit, ParseResult } from "./ast.js" */

export { checkSubset, SUBSET_RULES };

/**
 * Parses the source of one arrow function, such as `String(fn)` of a runtime lambda.
 * Never throws for bad input: failures come back as `{ ok: false, diagnostics }`.
 * @param {string} src
 * @returns {ParseResult}
 */
export function parseLambda(src) {
  const parser = new Parser(src);
  try {
    return { ok: true, ast: parser.parseLambda(), diagnostics: [] };
  } catch (e) {
    if (!(e instanceof SyntaxFailure)) throw e;
    const end = Math.min(Math.max(e.end, e.start), src.length);
    /** @type {Diagnostic} */
    const d = {
      code: e.code, severity: "error", message: e.message, tip: e.tip,
      loc: { start: parser.lexer.positionAt(e.start), end: parser.lexer.positionAt(end) },
      range: [e.start, end],
    };
    return { ok: false, ast: null, diagnostics: [d] };
  }
}

/**
 * Applies non-overlapping edits to `src`, in any order.
 * @param {string} src
 * @param {Edit[]} edits
 * @returns {string}
 */
export function applyEdits(src, edits) {
  const sorted = [...edits].sort((a, b) => a.range[0] - b.range[0]);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].range[0] < sorted[i - 1].range[1]) throw new Error(`edits overlap at ${sorted[i].range[0]}: apply them one diagnostic at a time`);
  }
  let out = src;
  for (const e of sorted.reverse()) out = out.slice(0, e.range[0]) + e.text + out.slice(e.range[1]);
  return out;
}
