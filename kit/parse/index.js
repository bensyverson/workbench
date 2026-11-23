// The subset parser: parse one runtime lambda from its source text, check it
// against the runtime subset, and apply the fixits diagnostics offer.

import { Parser } from "./parser.js";
import { SyntaxFailure, LineTable } from "./lexer.js";
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
  try {
    return { ok: true, ast: new Parser(src).parseLambda(), diagnostics: [] };
  } catch (e) {
    // Runaway nesting overflows the call stack; report it like any other bad input.
    const failure = e instanceof RangeError && /call stack/i.test(e.message)
      ? new SyntaxFailure("P001", "This is nested too deeply to parse.", "Flatten the expression with intermediate variables.", 0, src.length)
      : e;
    if (!(failure instanceof SyntaxFailure)) throw failure;
    const start = failure.start;
    const end = Math.min(Math.max(failure.end, start), src.length);
    const lines = new LineTable(src);
    /** @type {Diagnostic} */
    const d = {
      code: failure.code, severity: "error", message: failure.message, tip: failure.tip,
      loc: { start: lines.at(start), end: lines.at(end) },
      range: [start, end],
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
